from __future__ import annotations
from typing import Optional, Dict
from .models import PaperPosition
from .state import PAPER_BALANCE, PAPER_POS_ID, PAPER_POSITIONS, INSTRUMENTS
from .utils import now_ts

def _pip_value(symbol: str) -> float:
    # simplified: 1 pip value per 1 lot in account currency is ~10 for majors
    # We'll compute PnL as (price_diff / pip) * (pip_value_per_lot) * volumeLots
    # Keep pip_value_per_lot=10.0 for simplicity.
    return 10.0

def open_position(symbol: str, side: str, volume: float, entry: float,
                  sl: Optional[float], tp: Optional[float]) -> PaperPosition:
    global PAPER_POS_ID
    pos = PaperPosition(
        id=PAPER_POS_ID, symbol=symbol, side=side, volume=volume,
        entry=entry, sl=sl, tp=tp, opened_at=now_ts()
    )
    PAPER_POSITIONS[PAPER_POS_ID] = pos
    PAPER_POS_ID += 1
    return pos

def try_close_by_price(pos: PaperPosition, price: float) -> Optional[PaperPosition]:
    if pos.status != "OPEN": return None
    hit_tp = price >= pos.tp if (pos.tp is not None and pos.side == "BUY") else \
             price <= pos.tp if (pos.tp is not None and pos.side == "SELL") else False
    hit_sl = price <= pos.sl if (pos.sl is not None and pos.side == "BUY") else \
             price >= pos.sl if (pos.sl is not None and pos.side == "SELL") else False
    if not (hit_tp or hit_sl): return None

    pos.status = "CLOSED"
    pos.closed_at = now_ts()
    pos.close_price = pos.tp if hit_tp else pos.sl
    # pnl calc
    pip = INSTRUMENTS.get(pos.symbol, {}).get("pip", 0.0001)
    diff = (pos.close_price - pos.entry) if pos.side == "BUY" else (pos.entry - pos.close_price)
    pnl_pips = diff / (pip or 1e-6)
    pos.pnl = pnl_pips * _pip_value(pos.symbol) * pos.volume
    return pos
