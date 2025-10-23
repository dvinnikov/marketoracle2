from typing import List, Optional
from .models import Bar, StrategySignal
from .indicators import ema, rsi, macd, bbands, swings
from .utils import now_ts, round_price
from .state import INSTRUMENTS

def _mk(symbol: str, strat: str, side: str, price: float, sl: float, tp: float) -> StrategySignal:
    digits = INSTRUMENTS.get(symbol,{}).get("digits",5)
    return StrategySignal(
        at=now_ts(), symbol=symbol, strategy=strat, side=side,
        entry=round_price(price, digits), stop=round_price(sl, digits), target=round_price(tp, digits)
    )

def rsi_crossover(symbol: str, bars: List[Bar]) -> Optional[StrategySignal]:
    if len(bars) < 30: return None
    closes = [b.c for b in bars]
    r = rsi(closes,14); e = ema(closes,50)
    if r[-2] < 30 <= r[-1] and closes[-1] > e[-1]:
        sl = bars[-1].l - 1.5*(bars[-1].h - bars[-1].l); tp = closes[-1] + 2*(closes[-1]-sl)
        return _mk(symbol,"RSI Crossover","BUY",closes[-1],sl,tp)
    if r[-2] > 70 >= r[-1] and closes[-1] < e[-1]:
        sl = bars[-1].h + 1.5*(bars[-1].h - bars[-1].l); tp = closes[-1] - 2*(sl-closes[-1])
        return _mk(symbol,"RSI Crossover","SELL",closes[-1],sl,tp)
    return None

def ema_crossover(symbol: str, bars: List[Bar]) -> Optional[StrategySignal]:
    if len(bars) < 60: return None
    closes = [b.c for b in bars]
    f, s = ema(closes,12), ema(closes,26)
    body = abs(bars[-1].c - bars[-1].o); rng = max(1e-6, bars[-1].h - bars[-1].l)
    vol_ok = (body/rng) > 0.35
    if f[-2] <= s[-2] and f[-1] > s[-1] and vol_ok:
        return _mk(symbol,"EMA Crossover","BUY",bars[-1].c,bars[-1].l,bars[-1].c + (bars[-1].h-bars[-1].l)*2.0)
    if f[-2] >= s[-2] and f[-1] < s[-1] and vol_ok:
        return _mk(symbol,"EMA Crossover","SELL",bars[-1].c,bars[-1].h,bars[-1].c - (bars[-1].h-bars[-1].l)*2.0)
    return None

def macd_div(symbol: str, bars: List[Bar]) -> Optional[StrategySignal]:
    if len(bars) < 70: return None
    closes = [b.c for b in bars]; m,_,_ = macd(closes)
    idxs = list(range(len(bars)-30, len(bars)))
    piv_lo = min(idxs, key=lambda i: bars[i].l);  piv_lo2 = min(idxs[:-5], key=lambda i: bars[i].l)
    piv_hi = max(idxs, key=lambda i: bars[i].h);  piv_hi2 = max(idxs[:-5], key=lambda i: bars[i].h)
    if bars[piv_lo].l < bars[piv_lo2].l and m[piv_lo] > m[piv_lo2]:
        return _mk(symbol,"MACD Divergence","BUY",bars[-1].c,bars[piv_lo].l,bars[-1].c + (bars[-1].h-bars[-1].l)*2.5)
    if bars[piv_hi].h > bars[piv_hi2].h and m[piv_hi] < m[piv_hi2]:
        return _mk(symbol,"MACD Divergence","SELL",bars[-1].c,bars[piv_hi].h,bars[-1].c - (bars[-1].h-bars[-1].l)*2.5)
    return None

def bb_bounce(symbol: str, bars: List[Bar]) -> Optional[StrategySignal]:
    if len(bars) < 25: return None
    closes = [b.c for b in bars]
    up, mid, dn = bbands(closes,20,2.0)
    if bars[-1].l <= dn[-1] <= bars[-1].c:
        return _mk(symbol,"Bollinger Bounce","BUY",bars[-1].c,bars[-1].l,mid[-1])
    if bars[-1].h >= up[-1] >= bars[-1].c:
        return _mk(symbol,"Bollinger Bounce","SELL",bars[-1].c,bars[-1].h,mid[-1])
    return None

def support_resistance(symbol: str, bars: List[Bar]) -> Optional[StrategySignal]:
    from .indicators import swings
    if len(bars) < 40: return None
    closes = [b.c for b in bars]; hi, lo = swings(closes,5)
    last_hi = next((hi[i] for i in range(len(hi)-2,5,-1) if hi[i] is not None), None)
    last_lo = next((lo[i] for i in range(len(lo)-2,5,-1) if lo[i] is not None), None)
    rng = (bars[-1].h - bars[-1].l)
    if last_lo and abs(bars[-1].l - last_lo) <= rng*0.3:
        return _mk(symbol,"Support/Resistance","BUY",bars[-1].c,last_lo - rng*0.8,bars[-1].c + rng*2.2)
    if last_hi and abs(bars[-1].h - last_hi) <= rng*0.3:
        return _mk(symbol,"Support/Resistance","SELL",bars[-1].c,last_hi + rng*0.8,bars[-1].c - rng*2.2)
    return None

STRATS = [rsi_crossover, macd_div, bb_bounce, ema_crossover, support_resistance]
CATALOG = [
    {"name":"RSI Crossover","desc":"RSI 30/70 crosses with EMA trend filter"},
    {"name":"MACD Divergence","desc":"Pivot-based bullish/bearish MACD divergence"},
    {"name":"Bollinger Bounce","desc":"±2σ touches reverting toward mean"},
    {"name":"EMA Crossover","desc":"12/26 cross with price/volume proxy"},
    {"name":"Support/Resistance","desc":"Bounce at recent swing zones"},
]
