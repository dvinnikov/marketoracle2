from fastapi import APIRouter, Query, HTTPException
from typing import Optional, List, Dict, Any
from ..state import (
    INSTRUMENTS, ACCOUNT, POSITIONS_SNAPSHOT, ORDERS_SNAPSHOT,
    BARS, SIGNALS, PRED_LOGS, COMMANDS, RUNNERS,
    register_instrument, PAPER_ENABLED, PAPER_DEFAULT_VOL, PAPER_BALANCE
)
from ..utils import to_res_sec
from ..strategies import CATALOG
from pydantic import BaseModel
import asyncio

router = APIRouter()

@router.get("/healthz")
def healthz():
    from ..state import TICKS
    return {"ok": True, "instruments": len(INSTRUMENTS), "ticks": sum(len(v) for v in TICKS.values())}

@router.get("/api/instruments")
def instruments():
    return {"symbols": sorted(INSTRUMENTS.keys()), "meta": INSTRUMENTS}

class RegisterInstrument(BaseModel):
    symbol: str
    digits: Optional[int] = None
    point: Optional[float] = None

@router.post("/api/instruments/register")
def instruments_register(req: RegisterInstrument):
    register_instrument(req.symbol, digits=req.digits, point=req.point)
    return {"ok": True, "meta": INSTRUMENTS[req.symbol]}

@router.get("/api/account")
def account(): return ACCOUNT or {}

@router.get("/api/positions")
def positions(): return {"positions": POSITIONS_SNAPSHOT}

@router.get("/api/orders")
def orders(): return {"orders": ORDERS_SNAPSHOT}

@router.get("/api/candles")
def candles(symbol: str, timeframe: str = Query("60"), limit: int = 500, before: Optional[int]=None):
    res = to_res_sec(timeframe)
    arr = list(BARS.get((symbol, res), []))
    if before: arr = [b for b in arr if b.t < before]
    out = arr[-limit:]
    return {"s":"ok","t":[b.t for b in out],"o":[b.o for b in out],"h":[b.h for b in out],"l":[b.l for b in out],"c":[b.c for b in out],"v":[b.v for b in out]}

# ----- orders API (queue to EA) -----
class MarketOrder(BaseModel):
    symbol: str; side: str; volume: float
    sl: Optional[float] = None; tp: Optional[float] = None

@router.post("/api/order/market")
def order_market(req: MarketOrder):
    from ..state import NEXT_CMD_ID, COMMANDS
    cmd = {"id": NEXT_CMD_ID, "type":"market", "side": req.side.lower(),
           "symbol": req.symbol, "volume": req.volume, "sl": req.sl, "tp": req.tp}
    NEXT_CMD_ID += 1
    COMMANDS.append(cmd); return {"queued": True, "id": cmd["id"]}

class PosClose(BaseModel): ticket: int
@router.post("/api/position/close")
def position_close(req: PosClose):
    from ..state import NEXT_CMD_ID, COMMANDS
    cmd = {"id": NEXT_CMD_ID, "type":"close", "ticket": int(req.ticket)}
    NEXT_CMD_ID += 1; COMMANDS.append(cmd); return {"queued": True, "id": cmd["id"]}

class PosModify(BaseModel): ticket: int; sl: Optional[float]=None; tp: Optional[float]=None
@router.post("/api/position/modify")
def position_modify(req: PosModify):
    from ..state import NEXT_CMD_ID, COMMANDS
    cmd = {"id": NEXT_CMD_ID, "type":"modify", "ticket": int(req.ticket), "sl": req.sl, "tp": req.tp}
    NEXT_CMD_ID += 1; COMMANDS.append(cmd); return {"queued": True, "id": cmd["id"]}

# ----- strategies control -----
@router.get("/api/strategies")
def strategies(): return {"catalog": CATALOG}

class StratStart(BaseModel):
    symbol: str; tf: str = "60"; strategies: Optional[List[str]] = None

@router.post("/api/strategies/start")
async def strategies_start(req: StratStart):
    from ..runners import runner
    res = to_res_sec(req.tf); key = f"{req.symbol}:{res}"
    if key in RUNNERS: return {"running": True, "key": key}
    enable = {x["name"]: True for x in CATALOG}
    if req.strategies is not None:
        for k in list(enable.keys()): enable[k] = k in req.strategies
    task = asyncio.create_task(runner(req.symbol, res, enable))
    RUNNERS[key] = task; return {"started": True, "key": key}

class StratStop(BaseModel): id: str
@router.post("/api/strategies/stop")
async def strategies_stop(req: StratStop):
    t = RUNNERS.pop(req.id, None)
    if t: t.cancel(); return {"stopped": True}
    return {"stopped": False}

@router.get("/api/signals")
def signals(limit: int = 100):
    from ..state import SIGNALS
    arr = list(SIGNALS)[-limit:]
    return {"signals": [s.__dict__ for s in arr], "count": len(arr)}

@router.get("/api/prediction")
def api_prediction(symbol: str, tf: str = "60"):
    from ..prediction import compute
    res = to_res_sec(tf); return compute(symbol, res)

@router.get("/api/predictions/log")
def api_predictions_log(symbol: str, tf: str = "60", limit: int = 200):
    from ..state import PRED_LOGS
    res = to_res_sec(tf); dq = PRED_LOGS.get((symbol,res), [])
    arr = list(dq)[-limit:]
    from ..runners import _serialize
    return {"symbol": symbol, "res": res, "items": [_serialize(x) for x in arr]}

# ----- paper trading controls -----
class PaperCfg(BaseModel):
    enabled: Optional[bool] = None
    volume: Optional[float] = None

@router.get("/api/paper/config")
def paper_config():
    return {"enabled": PAPER_ENABLED, "volume": PAPER_DEFAULT_VOL, "balance": PAPER_BALANCE}

@router.post("/api/paper/config")
def set_paper_config(cfg: PaperCfg):
    global PAPER_ENABLED, PAPER_DEFAULT_VOL
    if cfg.enabled is not None: 
        from ..state import PAPER_ENABLED as PE; PE  # noqa
        from .. import state as st; st.PAPER_ENABLED = cfg.enabled
    if cfg.volume is not None and cfg.volume > 0:
        from .. import state as st; st.PAPER_DEFAULT_VOL = float(cfg.volume)
    return {"ok": True, "enabled": PAPER_ENABLED, "volume": PAPER_DEFAULT_VOL}
