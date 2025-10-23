from __future__ import annotations
import asyncio, time
from typing import Dict, List, Tuple
from fastapi import FastAPI
from .models import StrategySignal, PredictionEntry, Bar
from .state import (
    BARS, TICKS, SIGNALS, RUNNERS, PRED_LOGS, INSTRUMENTS,
    WS_SIGNALS, WS_PRED, WS_PRED_LOG, PRED_ID, PRED_HORIZON_SEC,
    PAPER_ENABLED, PAPER_DEFAULT_VOL, PAPER_POSITIONS
)
from .strategies import STRATS
from .prediction import compute as compute_prediction
from .utils import now_ts, to_res_sec, fmt_day
from .state import register_instrument
from .paper import open_position, try_close_by_price

# ---- fanout helpers ----
async def fanout(ws_list, payload):
    dead=[]
    for ws in list(ws_list):
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(ws)
    for d in dead:
        ws_list.remove(d)

def latest_mid(symbol: str):
    dq = TICKS.get(symbol)
    if dq:
        t = dq[-1]
        return (t.bid + t.ask) / 2.0
    return None

# ---- strategy runner per (symbol,res) ----
async def runner(symbol: str, res: int, enabled: Dict[str,bool]):
    key = f"{symbol}:{res}"
    last_bar_t = None
    try:
        while True:
            await asyncio.sleep(0.2)
            bars = list(BARS.get((symbol, res), []))
            if len(bars) < 5: continue
            cur = bars[-1]
            if last_bar_t is None:
                last_bar_t = cur.t
                continue
            if cur.t != last_bar_t:
                last_bar_t = cur.t
                closed = bars[:-1]

                # Generate signals
                for f in STRATS:
                    name = f.__name__.replace("_"," ").title()
                    if not enabled.get(name, True): continue
                    sig = f(symbol, closed)
                    if sig:
                        SIGNALS.append(sig)
                        await fanout(WS_SIGNALS, sig.__dict__)
                        # auto-enter paper trade
                        if PAPER_ENABLED:
                            open_position(symbol, sig.side, PAPER_DEFAULT_VOL, sig.entry, sig.stop, sig.target)

                # Prediction
                pred = compute_prediction(symbol, res)
                await fanout(WS_PRED[(symbol,res)], {"symbol":symbol,"res":res, **pred})
                from .state import PRED_ID as _PRED_ID
                entry = PredictionEntry(
                    id=_PRED_ID, symbol=symbol, res=res, made_at=now_ts(),
                    direction=pred["direction"], confidence=float(pred["confidence"]),
                    target=float(pred["target"]), status="PENDING", hit_at=None,
                    last_price=latest_mid(symbol), deadline=now_ts()+PRED_HORIZON_SEC, day=fmt_day(now_ts())
                )
                from .state import PRED_ID as PRED_ID_MUT
                PRED_LOGS[(symbol,res)].append(entry)
                await fanout(WS_PRED_LOG[(symbol,res)], {"type":"prediction_log","entry":_serialize(entry)})
                PRED_ID_MUT += 1
                from .state import PRED_ID as _ignore; _ignore  # quiet lints
    finally:
        RUNNERS.pop(key, None)

def _serialize(e: PredictionEntry) -> dict:
    from .utils import round_price
    digits = INSTRUMENTS.get(e.symbol,{}).get("digits",5)
    return {
        "id": e.id, "symbol": e.symbol, "res": e.res, "made_at": e.made_at,
        "direction": e.direction, "confidence": round(float(e.confidence),2),
        "target": round_price(e.target, digits), "status": e.status,
        "hit_at": e.hit_at, "last_price": e.last_price, "deadline": e.deadline, "day": e.day
    }

# ---- watchers: predictions + signals + paper positions ----
async def prediction_watcher():
    from .state import PRED_LOGS
    while True:
        await asyncio.sleep(1.0)
        now = now_ts()
        for key, dq in list(PRED_LOGS.items()):
            sym, res = key
            if not dq: continue
            mid = latest_mid(sym)
            for e in dq:
                if e.status != "PENDING": continue
                if mid is not None:
                    e.last_price = mid
                    if (mid >= e.target and e.direction in ("BUY","NEUTRAL")) or \
                       (mid <= e.target and e.direction in ("SELL","NEUTRAL")):
                        e.status = "HIT"; e.hit_at = now
                        await fanout(WS_PRED_LOG[(sym,res)], {"type":"prediction_log","entry":_serialize(e)})
                        continue
                if e.deadline and now >= e.deadline:
                    e.status = "MISS"; e.hit_at = None
                    await fanout(WS_PRED_LOG[(sym,res)], {"type":"prediction_log","entry":_serialize(e)})

async def signal_watcher():
    """
    Monitors ACTIVE strategy signals against live mid and:
    - marks status CLOSED + result WIN/LOSS
    - updates pnl (paper-trade style calc using default vol)
    Also closes real paper positions if enabled.
    """
    from .state import SIGNALS, INSTRUMENTS, PAPER_ENABLED, PAPER_DEFAULT_VOL, PAPER_POSITIONS
    while True:
        await asyncio.sleep(0.25)
        # walk a snapshot to avoid churn
        items = list(SIGNALS)
        for s in items:
            if s.status != "ACTIVE": continue
            mid = latest_mid(s.symbol)
            if mid is None: continue
            # hit TP?
            if (s.side == "BUY" and mid >= s.target) or (s.side == "SELL" and mid <= s.target):
                s.status = "CLOSED"; s.result = "WIN"
            # hit SL?
            elif (s.side == "BUY" and mid <= s.stop) or (s.side == "SELL" and mid >= s.stop):
                s.status = "CLOSED"; s.result = "LOSS"
            else:
                continue

            # compute pnl (paper)
            pip = INSTRUMENTS.get(s.symbol,{}).get("pip",0.0001)
            close_px = s.target if s.result == "WIN" else s.stop
            diff = (close_px - s.entry) if s.side == "BUY" else (s.entry - close_px)
            pnl_pips = diff / (pip or 1e-6)
            s.pnl = pnl_pips * 10.0 * PAPER_DEFAULT_VOL

            # fanout update
            await fanout(WS_SIGNALS, s.__dict__)

            # close associated paper positions (if any)
            if PAPER_ENABLED:
                # naive: close all open paper positions for this symbol & side at price
                for pos in list(PAPER_POSITIONS.values()):
                    if pos.symbol == s.symbol and pos.status == "OPEN" and pos.side == s.side:
                        try_close_by_price(pos, close_px)

async def start_background_tasks(app: FastAPI):
    app.state.pred_task = asyncio.create_task(prediction_watcher())
    app.state.signal_task = asyncio.create_task(signal_watcher())
