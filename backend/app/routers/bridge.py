# app/routers/bridge.py
from fastapi import APIRouter, Request
from pydantic import BaseModel
import json, time

from ..state import (
    ACCOUNT, POSITIONS_SNAPSHOT, ORDERS_SNAPSHOT, COMMANDS,
    register_instrument, BARS, TICKS, WS_TICKS, WS_BARS
)
from ..models import Tick, Bar

router = APIRouter()

async def _fanout_ticks(symbol: str, payload: dict):
    dead = []
    for ws in list(WS_TICKS[symbol]):
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        WS_TICKS[symbol].remove(ws)

async def _fanout_bars(symbol: str, res: int, payload: dict):
    dead = []
    for ws in list(WS_BARS[(symbol, res)]):
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        WS_BARS[(symbol, res)].remove(ws)

class FetchCmd(BaseModel):
    after: int = 0

class BridgeInstrumentsBody(BaseModel):
    symbols: list[dict]  # {"symbol": str, "digits"?: int, "point"?: float}

@router.post("/bridge/tick")
async def bridge_tick(req: Request):
    raw = (await req.body()).replace(b"\x00", b"")
    data = json.loads(raw.decode("utf-8", errors="ignore"))

    sym = data["symbol"]
    bid = float(data["bid"])
    ask = float(data["ask"])
    t = float(data.get("time", time.time()))
    register_instrument(sym)

    # 1) store tick
    TICKS[sym].append(Tick(t=t, bid=bid, ask=ask))

    # 2) aggregate bars (track all known resolutions; default M1)
    mid = (bid + ask) / 2.0
    res_set = {res for (s, res) in BARS.keys() if s == sym} or {60}
    last_bar = {}
    for res in res_set:
        q = BARS[(sym, res)]
        bucket = int(t // res) * res
        if q and q[-1].t == bucket:
            b = q[-1]
            b.h = max(b.h, mid); b.l = min(b.l, mid); b.c = mid; b.v += 1
        else:
            b = Bar(t=bucket, o=mid, h=mid, l=mid, c=mid, v=1)
            q.append(b)
        last_bar[res] = b

    # 3) push to websockets (this is what the UI was missing)
    await _fanout_ticks(sym, {"symbol": sym, "bid": bid, "ask": ask, "t": t})
    for res, bar in last_bar.items():
        await _fanout_bars(sym, res, {"symbol": sym, "res": res, "bar": bar.__dict__})

    return {"ok": True}

@router.post("/bridge/account")
async def bridge_account(req: Request):
    global ACCOUNT
    ACCOUNT = await req.json()
    return {"ok": True}

@router.post("/bridge/positions")
async def bridge_positions(req: Request):
    global POSITIONS_SNAPSHOT
    data = await req.json()
    POSITIONS_SNAPSHOT = data.get("positions", [])
    for p in POSITIONS_SNAPSHOT:
        s = p.get("symbol")
        if s: register_instrument(s)
    return {"ok": True}

@router.post("/bridge/orders")
async def bridge_orders(req: Request):
    global ORDERS_SNAPSHOT
    data = await req.json()
    ORDERS_SNAPSHOT = data.get("orders", [])
    for o in ORDERS_SNAPSHOT:
        s = o.get("symbol")
        if s: register_instrument(s)
    return {"ok": True}

@router.post("/bridge/commands/fetch")
async def bridge_fetch(req: Request):
    body = FetchCmd(**(await req.json()))
    items = [c for c in list(COMMANDS) if c["id"] > body.after]
    return {"commands": items}

@router.post("/bridge/commands/ack")
async def bridge_ack(req: Request):
    return {"ack": True}

@router.post("/bridge/instruments")
async def bridge_instruments(req: Request):
    body = BridgeInstrumentsBody(**(await req.json()))
    cnt = 0
    for item in body.symbols:
        sym = item.get("symbol")
        if not sym:
            continue
        register_instrument(sym, digits=item.get("digits"), point=item.get("point"))
        cnt += 1
    return {"ok": True, "count": cnt}

@router.post("/bridge/status")
async def bridge_status(req: Request):
    return {"ok": True}
