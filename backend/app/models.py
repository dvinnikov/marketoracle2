from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Deque, Dict, List, Optional, Tuple
from collections import deque

# ========= Market data =========
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

# ========= Signals (strategy outputs) =========
@dataclass
class StrategySignal:
    at: int
    symbol: str
    strategy: str
    side: str       # BUY / SELL
    entry: float
    stop: float
    target: float
    status: str = "ACTIVE"  # ACTIVE / CLOSED / STOPPED
    result: Optional[str] = None  # WIN / LOSS
    pnl: Optional[float] = None   # currency

# ========= Predictions =========
@dataclass
class PredictionEntry:
    id: int
    symbol: str
    res: int
    made_at: int
    direction: str         # BUY / SELL / NEUTRAL
    confidence: float
    target: float
    status: str = "PENDING"   # PENDING / HIT / MISS
    hit_at: Optional[int] = None
    last_price: Optional[float] = None
    deadline: Optional[int] = None
    day: str = ""             # YYYY-MM-DD

# ========= Paper Trading =========
@dataclass
class PaperPosition:
    id: int
    symbol: str
    side: str          # BUY / SELL
    volume: float
    entry: float
    sl: Optional[float]
    tp: Optional[float]
    opened_at: int
    closed_at: Optional[int] = None
    close_price: Optional[float] = None
    pnl: Optional[float] = None
    status: str = "OPEN"  # OPEN / CLOSED

# ========= In-memory stores (typed hints used elsewhere) =========
TicksStore   = Dict[str, Deque[Tick]]
BarsStore    = Dict[Tuple[str, int], Deque[Bar]]
SignalsStore = Deque[StrategySignal]
PredStore    = Dict[Tuple[str, int], Deque[PredictionEntry]]
WSMap        = Dict[Any, List[Any]]
