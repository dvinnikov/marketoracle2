# server.py
from __future__ import annotations

import asyncio
import json
import math
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Any, Deque, Dict, List, Optional, Tuple

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# ======================================================================================
# In-memory state
# ======================================================================================

@dataclass
class Tick:
    t: float
    bid: float
    ask: float

@dataclass
class Bar:
    t: int
    o: float
    h: float
    l: float
    c: float
    v: float = 0.0

@dataclass
class StrategySignal:
    at: int
    symbol: str
    strategy: str
    side: str       # "BUY"/"SELL"
    entry: float
    stop: float
    target: float
    status: str = "ACTIVE"  # ACTIVE/CLOSED/STOPPED
    result: Optional[str] = None  # WIN/LOSS
    pnl: Optional[float] = None

# Global stores
TICKS: Dict[str, Deque[Tick]] = defaultdict(lambda: deque(maxlen=10_000))
BARS: Dict[Tuple[str, int], Deque[Bar]] = defaultdict(lambda: deque(maxlen=10_000))  # (symbol, res_sec)
ACCOUNT: Dict[str, Any] = {}
POSITIONS: List[Dict[str, Any]] = []
ORDERS: List[Dict[str, Any]] = []

# symbol -> {digits, point, pip, updated}
INSTRUMENTS: Dict[str, Dict[str, Any]] = {}

# Command queue for EA
NEXT_CMD_ID = 1
COMMANDS: Deque[Dict[str, Any]] = deque(maxlen=1_000)

# WS subscribers
WS_TICKS: Dict[str, List[WebSocket]] = defaultdict(list)            # by symbol
WS_BARS: Dict[Tuple[str, int], List[WebSocket]] = defaultdict(list)
WS_SIGNALS: List[WebSocket] = []
WS_PRED: Dict[Tuple[str, int], List[WebSocket]] = defaultdict(list)

# Strategy runners
RUNNERS: Dict[str, asyncio.Task] = {}        # key: f"{symbol}:{res}"
SIGNAL_LOGS: Deque[StrategySignal] = deque(maxlen=5_000)

# ======================================================================================
# Utilities
# ======================================================================================

def now_ts() -> int:
    return int(time.time())

def to_res_sec(tf: str | int) -> int:
    if isinstance(tf, int): return tf
    m = tf.strip().lower()
    if m.endswith("m"): return int(m[:-1]) * 60
    if m.endswith("h"): return int(m[:-1]) * 3600
    if m.endswith("d"): return int(m[:-1]) * 86400
    return int(m)  # seconds

def round_price(p: float, digits: int = 5) -> float:
    k = 10 ** digits
    return math.floor(p * k + 0.5) / k

def _pip_from_digits_point(digits: Optional[int], point: Optional[float]) -> float:
    if digits is None or point is None:
        return 0.0001
    # FX convention: 5/3 digits -> pip = 10 * point
    return (10.0 * point) if digits in (3, 5) else point

def register_instrument(
    symbol: str,
    *,
    digits: Optional[int] = None,
    point: Optional[float] = None,
    label: Optional[str] = None,
    name: Optional[str] = None,
    category: Optional[str] = None,
):
    meta = dict(INSTRUMENTS.get(symbol, {}))
    if digits is None: digits = meta.get("digits")
    if point  is None: point  = meta.get("point")
    if label  is None: label  = meta.get("label")
    if name   is None: name   = meta.get("name")
    if category is None: category = meta.get("category")
    if digits is None: digits = 5
    if point  is None: point  = 0.00001 if digits >= 5 else 0.01
    meta.update({
        "digits": digits,
        "point":  point,
        "pip":    _pip_from_digits_point(digits, point),
        "updated": now_ts(),
    })
    if label is not None: meta["label"] = label
    if name is not None: meta["name"] = name
    if category is not None: meta["category"] = category
    INSTRUMENTS[symbol] = meta
    return meta


def load_static_instrument_catalog():
    from pathlib import Path

    catalog_path = Path(__file__).resolve().parents[1] / "shared" / "instruments" / "catalog.json"
    if not catalog_path.exists():
        return

    try:
        payload = json.loads(catalog_path.read_text(encoding="utf-8"))
    except Exception:
        return

    if not isinstance(payload, list):
        return

    for entry in payload:
        if not isinstance(entry, dict):
            continue
        symbol = entry.get("symbol")
        if not symbol:
            continue
        register_instrument(
            symbol,
            digits=entry.get("digits"),
            point=entry.get("point"),
            label=entry.get("label"),
            name=entry.get("name"),
            category=entry.get("category"),
        )


# Seed default instrument catalog so the API exposes richer metadata before MT5 connects
load_static_instrument_catalog()

# ======================================================================================
# Bar aggregation
# ======================================================================================

def add_tick(symbol: str, bid: float, ask: float, t: Optional[float] = None):
    t = t if t is not None else time.time()
    TICKS[symbol].append(Tick(t=t, bid=bid, ask=ask))
    mid = (bid + ask) / 2.0
    # Update all known resolutions that have subscribers or runners; default to M1
    res_set = {res for (sym, res) in BARS.keys() if sym == symbol}
    if not res_set:
        res_set = {60}
    for res in res_set:
        q = BARS[(symbol, res)]
        bucket = int(t // res) * res
        if q and q[-1].t == bucket:
            b = q[-1]
            b.h = max(b.h, mid); b.l = min(b.l, mid); b.c = mid; b.v += 1
        else:
            q.append(Bar(t=bucket, o=mid, h=mid, l=mid, c=mid, v=1))

async def fanout_ticks(symbol: str, payload: dict):
    dead = []
    for ws in WS_TICKS[symbol]:
        try: await ws.send_json(payload)
        except Exception: dead.append(ws)
    for ws in dead: WS_TICKS[symbol].remove(ws)

async def fanout_bars(symbol: str, res: int, payload: dict):
    dead = []
    for ws in WS_BARS[(symbol, res)]:
        try: await ws.send_json(payload)
        except Exception: dead.append(ws)
    for ws in dead: WS_BARS[(symbol, res)].remove(ws)

async def fanout_signal(sig: StrategySignal):
    data = sig.__dict__.copy()
    dead = []
    for ws in WS_SIGNALS:
        try: await ws.send_json(data)
        except Exception: dead.append(ws)
    for ws in dead: WS_SIGNALS.remove(ws)

async def fanout_prediction(symbol: str, res: int, payload: dict):
    dead = []
    for ws in WS_PRED[(symbol, res)]:
        try: await ws.send_json(payload)
        except Exception: dead.append(ws)
    for ws in dead: WS_PRED[(symbol, res)].remove(ws)

# ======================================================================================
# Indicators (compact, dependency-free)
# ======================================================================================

def ema(vals: List[float], period: int) -> List[float]:
    k = 2 / (period + 1)
    out = []
    s = None
    for v in vals:
        s = v if s is None else (v - s) * k + s
        out.append(s)
    return out

def rsi(vals: List[float], period: int=14) -> List[float]:
    gains, losses = 0.0, 0.0
    rsis = [50.0] * len(vals)
    for i in range(1, len(vals)):
        ch = vals[i] - vals[i-1]
        gain = max(0.0, ch); loss = max(0.0, -ch)
        if i <= period:
            gains += gain; losses += loss
            rsis[i] = 50.0
        else:
            gains = (gains*(period-1) + gain)/period
            losses = (losses*(period-1) + loss)/period
            rs = (gains / (losses+1e-9))
            rsis[i] = 100.0 - (100.0/(1.0+rs))
    return rsis

def macd(vals: List[float], fast=12, slow=26, signal=9) -> Tuple[List[float], List[float], List[float]]:
    macd_line = [a - b for a,b in zip(ema(vals, fast), ema(vals, slow))]
    signal_line = ema(macd_line, signal)
    hist = [m - s for m,s in zip(macd_line, signal_line)]
    return macd_line, signal_line, hist

def bbands(vals: List[float], period=20, mult=2.0) -> Tuple[List[float], List[float], List[float]]:
    out_mid, out_up, out_dn = [], [], []
    win: Deque[float] = deque(maxlen=period)
    for v in vals:
        win.append(v)
        m = sum(win)/len(win)
        var = sum((x-m)**2 for x in win)/max(1, len(win))
        sd = math.sqrt(var)
        out_mid.append(m); out_up.append(m + mult*sd); out_dn.append(m - mult*sd)
    return out_up, out_mid, out_dn

def swings(vals: List[float], lookback=5) -> Tuple[List[Optional[float]], List[Optional[float]]]:
    hi = [None]*len(vals); lo = [None]*len(vals)
    for i in range(lookback, len(vals)-lookback):
        if vals[i] == max(vals[i-lookback:i+lookback+1]): hi[i] = vals[i]
        if vals[i] == min(vals[i-lookback:i+lookback+1]): lo[i] = vals[i]
    return hi, lo

# ======================================================================================
# Strategies (light signals on bar close)
# ======================================================================================

def mk_signal(symbol: str, strat: str, side: str, price: float, sl: float, tp: float) -> StrategySignal:
    digits = INSTRUMENTS.get(symbol, {}).get("digits", 5)
    return StrategySignal(
        at=now_ts(), symbol=symbol, strategy=strat, side=side,
        entry=round_price(price, digits), stop=round_price(sl, digits), target=round_price(tp, digits)
    )

def strat_rsi_cross(symbol: str, bars: List[Bar]) -> Optional[StrategySignal]:
    if len(bars) < 30: return None
    closes = [b.c for b in bars]
    r = rsi(closes, 14)
    e = ema(closes, 50)
    if r[-2] < 30 <= r[-1] and closes[-1] > e[-1]:
        sl = bars[-1].l - 1.5*(bars[-1].h - bars[-1].l)
        tp = closes[-1] + 2*(closes[-1]-sl)
        return mk_signal(symbol, "RSI Crossover", "BUY", closes[-1], sl, tp)
    if r[-2] > 70 >= r[-1] and closes[-1] < e[-1]:
        sl = bars[-1].h + 1.5*(bars[-1].h - bars[-1].l)
        tp = closes[-1] - 2*(sl - closes[-1])
        return mk_signal(symbol, "RSI Crossover", "SELL", closes[-1], sl, tp)
    return None

def strat_ema_cross(symbol: str, bars: List[Bar]) -> Optional[StrategySignal]:
    if len(bars) < 60: return None
    closes = [b.c for b in bars]
    f, s = ema(closes, 12), ema(closes, 26)
    body = abs(bars[-1].c - bars[-1].o); rng = max(1e-6, bars[-1].h - bars[-1].l)
    vol_ok = (body / rng) > 0.35
    if f[-2] <= s[-2] and f[-1] > s[-1] and vol_ok:
        sl = bars[-1].l
        tp = bars[-1].c + (bars[-1].h - bars[-1].l)*2.0
        return mk_signal(symbol, "EMA Crossover", "BUY", closes[-1], sl, tp)
    if f[-2] >= s[-2] and f[-1] < s[-1] and vol_ok:
        sl = bars[-1].h
        tp = bars[-1].c - (bars[-1].h - bars[-1].l)*2.0
        return mk_signal(symbol, "EMA Crossover", "SELL", closes[-1], sl, tp)
    return None

def strat_macd_div(symbol: str, bars: List[Bar]) -> Optional[StrategySignal]:
    if len(bars) < 70: return None
    closes = [b.c for b in bars]
    m, _, _ = macd(closes)
    idxs = [i for i in range(len(bars)-30, len(bars))]
    piv_lo = min(idxs, key=lambda i: bars[i].l)
    piv_lo2 = min(idxs[:-5], key=lambda i: bars[i].l)
    piv_hi = max(idxs, key=lambda i: bars[i].h)
    piv_hi2 = max(idxs[:-5], key=lambda i: bars[i].h)
    if bars[piv_lo].l < bars[piv_lo2].l and m[piv_lo] > m[piv_lo2]:
        sl = bars[piv_lo].l; tp = bars[-1].c + (bars[-1].h - bars[-1].l)*2.5
        return mk_signal(symbol, "MACD Divergence", "BUY", bars[-1].c, sl, tp)
    if bars[piv_hi].h > bars[piv_hi2].h and m[piv_hi] < m[piv_hi2]:
        sl = bars[piv_hi].h; tp = bars[-1].c - (bars[-1].h - bars[-1].l)*2.5
        return mk_signal(symbol, "MACD Divergence", "SELL", bars[-1].c, sl, tp)
    return None

def strat_bollinger_bounce(symbol: str, bars: List[Bar]) -> Optional[StrategySignal]:
    if len(bars) < 25: return None
    closes = [b.c for b in bars]
    up, mid, dn = bbands(closes, 20, 2.0)
    if bars[-1].l <= dn[-1] <= bars[-1].c:
        sl = bars[-1].l; tp = mid[-1]
        return mk_signal(symbol, "Bollinger Bounce", "BUY", bars[-1].c, sl, tp)
    if bars[-1].h >= up[-1] >= bars[-1].c:
        sl = bars[-1].h; tp = mid[-1]
        return mk_signal(symbol, "Bollinger Bounce", "SELL", bars[-1].c, sl, tp)
    return None

def strat_support_resistance(symbol: str, bars: List[Bar]) -> Optional[StrategySignal]:
    if len(bars) < 40: return None
    closes = [b.c for b in bars]
    hi, lo = swings(closes, 5)
    last_hi = next((hi[i] for i in range(len(hi)-2, 5, -1) if hi[i] is not None), None)
    last_lo = next((lo[i] for i in range(len(lo)-2, 5, -1) if lo[i] is not None), None)
    if last_lo and abs(bars[-1].l - last_lo) <= (bars[-1].h - bars[-1].l)*0.3:
        sl = last_lo - (bars[-1].h - bars[-1].l)*0.8
        tp = bars[-1].c + (bars[-1].h - bars[-1].l)*2.2
        return mk_signal(symbol, "Support/Resistance", "BUY", bars[-1].c, sl, tp)
    if last_hi and abs(bars[-1].h - last_hi) <= (bars[-1].h - bars[-1].l)*0.3:
        sl = last_hi + (bars[-1].h - bars[-1].l)*0.8
        tp = bars[-1].c - (bars[-1].h - bars[-1].l)*2.2
        return mk_signal(symbol, "Support/Resistance", "SELL", bars[-1].c, sl, tp)
    return None

STRATS = [
    strat_rsi_cross,
    strat_macd_div,
    strat_bollinger_bounce,
    strat_ema_cross,
    strat_support_resistance,
]

# ======================================================================================
# Prediction ensemble
# ======================================================================================

def prediction(symbol: str, res: int) -> Dict[str, Any]:
    bars = list(BARS.get((symbol, res), []))
    if len(bars) < 30:
        return {"direction":"NEUTRAL","confidence":0.5,"target":bars[-1].c if bars else None}
    closes = [b.c for b in bars]
    up, mid, dn = bbands(closes, 20, 2.0)
    r = rsi(closes, 14)
    f, s = ema(closes, 12), ema(closes, 26)

    votes_up = 0
    votes_dn = 0
    if bars[-1].c < dn[-1]: votes_up += 1
    if bars[-1].c > up[-1]: votes_dn += 1
    if f[-1] > s[-1]: votes_up += 1
    if f[-1] < s[-1]: votes_dn += 1
    if r[-1] < 35: votes_up += 1
    if r[-1] > 65: votes_dn += 1

    total = 6
    if votes_up == votes_dn:
        direction = "NEUTRAL"
    elif votes_up > votes_dn:
        direction = "BUY"
    else:
        direction = "SELL"

    confidence = max(votes_up, votes_dn)/total
    tgt = mid[-1]
    return {"direction": direction, "confidence": round(confidence, 2), "target": round_price(tgt, INSTRUMENTS.get(symbol,{}).get("digits",5))}

# ======================================================================================
# Strategy runner (per symbol+resolution)
# ======================================================================================

async def runner(symbol: str, res: int, enable: Dict[str,bool]):
    key = f"{symbol}:{res}"
    last_bar_t = None
    try:
        while True:
            await asyncio.sleep(0.2)
            bars = list(BARS.get((symbol, res), []))
            if len(bars) < 5: continue
            last = bars[-1]
            if last_bar_t is None:
                last_bar_t = last.t
                continue
            if last.t != last_bar_t:
                last_bar_t = last.t
                closed_bars = bars[:-1]
                for f in STRATS:
                    name = f.__name__.replace("strat_","").replace("_"," ").title()
                    if not enable.get(name, True):
                        continue
                    sig = f(symbol, closed_bars)
                    if sig:
                        SIGNAL_LOGS.append(sig)
                        await fanout_signal(sig)
                pred = prediction(symbol, res)
                await fanout_prediction(symbol, res, {"symbol":symbol,"res":res, **pred})
    finally:
        RUNNERS.pop(key, None)

# ======================================================================================
# FastAPI app
# ======================================================================================

app = FastAPI(title="MT5 Backend Bridge + Strategies")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

# ------------------ Public REST -------------------------------------------------------

@app.get("/healthz")
def healthz():
    return {"ok": True, "instruments": len(INSTRUMENTS), "ticks": sum(len(v) for v in TICKS.values())}

@app.get("/api/instruments")
def instruments():
    syms = sorted(list(INSTRUMENTS.keys()))
    return {"symbols": syms, "meta": INSTRUMENTS}

class RegisterInstrument(BaseModel):
    symbol: str
    digits: Optional[int] = None
    point:  Optional[float] = None

@app.post("/api/instruments/register")
def api_instruments_register(req: RegisterInstrument):
    register_instrument(req.symbol, digits=req.digits, point=req.point)
    return {"ok": True, "meta": INSTRUMENTS[req.symbol]}

@app.get("/api/account")
def account():
    return ACCOUNT or {}

@app.get("/api/positions")
def positions():
    return {"positions": POSITIONS}

@app.get("/api/orders")
def orders():
    return {"orders": ORDERS}

@app.get("/api/candles")
def candles(symbol: str, timeframe: str = Query("60"), limit: int = 500, before: Optional[int]=None):
    res = to_res_sec(timeframe)
    arr = list(BARS.get((symbol, res), []))
    if before:
        arr = [b for b in arr if b.t < before]
    out = arr[-limit:]
    return {"s":"ok","t":[b.t for b in out],"o":[b.o for b in out],"h":[b.h for b in out],"l":[b.l for b in out],"c":[b.c for b in out],"v":[b.v for b in out]}

class MarketOrder(BaseModel):
    symbol: str
    side: str                    # "buy"/"sell"
    volume: float
    sl: Optional[float] = None
    tp: Optional[float] = None

@app.post("/api/order/market")
def order_market(req: MarketOrder):
    global NEXT_CMD_ID
    cmd = {"id": NEXT_CMD_ID, "type":"market", "side": req.side.lower(), "symbol": req.symbol, "volume": req.volume, "sl": req.sl, "tp": req.tp}
    NEXT_CMD_ID += 1
    COMMANDS.append(cmd)
    return {"queued": True, "id": cmd["id"]}

class PosClose(BaseModel):
    ticket: int

@app.post("/api/position/close")
def position_close(req: PosClose):
    global NEXT_CMD_ID
    cmd = {"id": NEXT_CMD_ID, "type":"close", "ticket": int(req.ticket)}
    NEXT_CMD_ID += 1
    COMMANDS.append(cmd)
    return {"queued": True, "id": cmd["id"]}

class PosModify(BaseModel):
    ticket: int
    sl: Optional[float] = None
    tp: Optional[float] = None

@app.post("/api/position/modify")
def position_modify(req: PosModify):
    global NEXT_CMD_ID
    cmd = {"id": NEXT_CMD_ID, "type":"modify", "ticket": int(req.ticket), "sl": req.sl, "tp": req.tp}
    NEXT_CMD_ID += 1
    COMMANDS.append(cmd)
    return {"queued": True, "id": cmd["id"]}

@app.get("/api/strategies")
def strategies():
    return {
        "catalog": [
            {"name":"RSI Crossover","desc":"RSI 30/70 crosses with EMA trend filter"},
            {"name":"MACD Divergence","desc":"Pivot-based bullish/bearish MACD divergence"},
            {"name":"Bollinger Bounce","desc":"±2σ touches reverting toward mean"},
            {"name":"EMA Crossover","desc":"12/26 cross with price/volume proxy"},
            {"name":"Support/Resistance","desc":"Bounce at recent swing zones"},
        ]
    }

class StratStart(BaseModel):
    symbol: str
    tf: str = "60"
    strategies: Optional[List[str]] = None   # names; default all

@app.post("/api/strategies/start")
async def strategies_start(req: StratStart):
    res = to_res_sec(req.tf)
    key = f"{req.symbol}:{res}"
    if key in RUNNERS:
        return {"running": True, "key": key}
    enable = {name: True for name in ["RSI Crossover","MACD Divergence","Bollinger Bounce","EMA Crossover","Support/Resistance"]}
    if req.strategies is not None:
        for k in list(enable.keys()):
            enable[k] = k in req.strategies
    task = asyncio.create_task(runner(req.symbol, res, enable))
    RUNNERS[key] = task
    return {"started": True, "key": key}

class StratStop(BaseModel):
    id: str

@app.post("/api/strategies/stop")
async def strategies_stop(req: StratStop):
    t = RUNNERS.pop(req.id, None)
    if t:
        t.cancel()
        return {"stopped": True}
    return {"stopped": False}

@app.get("/api/signals")
def signals(limit: int = 100):
    arr = list(SIGNAL_LOGS)[-limit:]
    return {"signals": [s.__dict__ for s in arr], "count": len(arr)}

@app.get("/api/prediction")
def api_prediction(symbol: str, tf: str = "60"):
    res = to_res_sec(tf)
    return prediction(symbol, res)

# ------------------ WebSockets --------------------------------------------------------

@app.websocket("/ws/ticks")
async def ws_ticks(ws: WebSocket, symbol: str):
    await ws.accept()
    WS_TICKS[symbol].append(ws)
    try:
        while True:
            await asyncio.sleep(3600)
    except WebSocketDisconnect:
        pass
    finally:
        if ws in WS_TICKS[symbol]: WS_TICKS[symbol].remove(ws)

@app.websocket("/ws/bars")
async def ws_bars(ws: WebSocket, symbol: str, res: int = 60):
    await ws.accept()
    WS_BARS[(symbol, res)].append(ws)
    try:
        while True:
            await asyncio.sleep(3600)
    except WebSocketDisconnect:
        pass
    finally:
        if ws in WS_BARS[(symbol, res)]: WS_BARS[(symbol, res)].remove(ws)

@app.websocket("/ws/signals")
async def ws_signals(ws: WebSocket):
    await ws.accept()
    WS_SIGNALS.append(ws)
    try:
        while True:
            await asyncio.sleep(3600)
    except WebSocketDisconnect:
        pass
    finally:
        if ws in WS_SIGNALS: WS_SIGNALS.remove(ws)

@app.websocket("/ws/prediction")
async def ws_prediction(ws: WebSocket, symbol: str, tf: str = "60"):
    res = to_res_sec(tf)
    await ws.accept()
    WS_PRED[(symbol, res)].append(ws)
    try:
        while True:
            await asyncio.sleep(3600)
    except WebSocketDisconnect:
        pass
    finally:
        if ws in WS_PRED[(symbol, res)]: WS_PRED[(symbol, res)].remove(ws)

# ------------------ Bridge endpoints (called by EA) ----------------------------------

@app.post("/bridge/tick")
async def bridge_tick(req: Request):
    raw = (await req.body()).replace(b"\x00", b"")
    data = json.loads(raw.decode("utf-8", errors="ignore"))
    sym = data["symbol"]; bid = float(data["bid"]); ask = float(data["ask"])
    t = float(data.get("time", time.time()))
    register_instrument(sym)  # register/refresh meta
    add_tick(sym, bid, ask, t)
    await fanout_ticks(sym, {"symbol": sym, "bid": bid, "ask": ask, "t": t})
    for (s, res), bars in list(BARS.items()):
        if s != sym or not bars: continue
        await fanout_bars(s, res, {"symbol": s, "res": res, "bar": bars[-1].__dict__})
    return {"ok": True}

@app.post("/bridge/account")
async def bridge_account(req: Request):
    global ACCOUNT
    ACCOUNT = await req.json()
    return {"ok": True}

@app.post("/bridge/positions")
async def bridge_positions(req: Request):
    global POSITIONS
    data = await req.json()
    POSITIONS = data.get("positions", [])
    for p in POSITIONS:
        s = p.get("symbol")
        if s: register_instrument(s)
    return {"ok": True}

@app.post("/bridge/orders")
async def bridge_orders(req: Request):
    global ORDERS
    data = await req.json()
    ORDERS = data.get("orders", [])
    for o in ORDERS:
        s = o.get("symbol")
        if s: register_instrument(s)
    return {"ok": True}

class FetchCmd(BaseModel):
    after: int = 0

@app.post("/bridge/commands/fetch")
def bridge_fetch(req: FetchCmd):
    items = [c for c in list(COMMANDS) if c["id"] > req.after]
    return {"commands": items}

class AckCmd(BaseModel):
    id: int
    ok: bool

@app.post("/bridge/commands/ack")
def bridge_ack(req: AckCmd):
    return {"ack": True}

class BridgeInstruments(BaseModel):
    symbols: List[dict]  # {"symbol": "...", "digits": 5, "point": 0.00001}

@app.post("/bridge/instruments")
def bridge_instruments(req: BridgeInstruments):
    for item in req.symbols:
        sym   = item.get("symbol")
        if not sym: continue
        digits = item.get("digits")
        point  = item.get("point")
        register_instrument(sym, digits=digits, point=point)
    return {"ok": True, "count": len(req.symbols)}

@app.post("/bridge/status")
def bridge_status(req: Request):
    return {"ok": True}

# ======================================================================================

@app.on_event("startup")
async def on_startup():
    pass

@app.exception_handler(Exception)
async def on_err(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": str(exc)})
