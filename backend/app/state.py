from __future__ import annotations
import asyncio, time, math
from collections import defaultdict, deque
from typing import Any, Deque, Dict, List, Optional, Tuple
from fastapi import FastAPI

from .models import Tick, Bar, StrategySignal, PredictionEntry, PaperPosition
from .utils import now_ts

# ======= global state =======
TICKS: Dict[str, Deque[Tick]] = defaultdict(lambda: deque(maxlen=10_000))
BARS: Dict[Tuple[str,int], Deque[Bar]] = defaultdict(lambda: deque(maxlen=10_000))
ACCOUNT: Dict[str, Any] = {}
POSITIONS_SNAPSHOT: List[Dict[str, Any]] = []
ORDERS_SNAPSHOT: List[Dict[str, Any]] = []

INSTRUMENTS: Dict[str, Dict[str, Any]] = {}  # symbol -> {digits, point, pip, updated, ...}

SIGNALS: Deque[StrategySignal] = deque(maxlen=5_000)
PRED_LOGS: Dict[Tuple[str,int], Deque[PredictionEntry]] = defaultdict(lambda: deque(maxlen=1000))

RUNNERS: Dict[str, asyncio.Task] = {}
NEXT_CMD_ID = 1
COMMANDS: Deque[Dict[str, Any]] = deque(maxlen=1000)

# WS registries
WS_TICKS: Dict[str, List[Any]] = defaultdict(list)
WS_BARS: Dict[Tuple[str, int], List[Any]] = defaultdict(list)
WS_SIGNALS: List[Any] = []
WS_PRED: Dict[Tuple[str,int], List[Any]] = defaultdict(list)
WS_PRED_LOG: Dict[Tuple[str,int], List[Any]] = defaultdict(list)

# Predictions
PRED_ID = 1
PRED_HORIZON_SEC = 4 * 3600

# Paper trading state
PAPER_ENABLED: bool = True
PAPER_DEFAULT_VOL: float = 0.10
PAPER_BALANCE: float = 100000.0
PAPER_POS_ID: int = 1
PAPER_POSITIONS: Dict[int, PaperPosition] = {}   # id -> position

# ======= helpers to register instruments =======
def _pip_from_digits_point(digits: Optional[int], point: Optional[float]) -> float:
    if digits is None or point is None: return 0.0001
    return (10.0 * point) if digits in (3,5) else point

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
        "point": point,
        "pip": _pip_from_digits_point(digits, point),
        "updated": now_ts(),
    })
    if label is not None: meta["label"] = label
    if name is not None: meta["name"] = name
    if category is not None: meta["category"] = category
    INSTRUMENTS[symbol] = meta
    return meta


def load_static_instrument_catalog():
    from pathlib import Path
    import json

    try:
        base_dir = Path(__file__).resolve().parents[2]
    except Exception:
        return

    catalog_path = base_dir / "shared" / "instruments" / "catalog.json"
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

# ======= startup/shutdown =======
async def on_startup(app: FastAPI):
    from .runners import start_background_tasks
    await start_background_tasks(app)

async def on_shutdown(app: FastAPI):
    # cancel tasks
    for k,t in list(RUNNERS.items()):
        t.cancel()
    if hasattr(app.state, "pred_task"):
        app.state.pred_task.cancel()
    if hasattr(app.state, "signal_task"):
        app.state.signal_task.cancel()


# Seed built-in catalog so the backend exposes sane defaults even before MT5 connects
load_static_instrument_catalog()
