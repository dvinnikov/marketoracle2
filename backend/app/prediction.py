from typing import Dict, List
from .state import BARS, INSTRUMENTS
from .indicators import ema, rsi, bbands
from .utils import round_price

def compute(symbol: str, res: int) -> Dict[str, float]:
    bars = list(BARS.get((symbol, res), []))
    if len(bars) < 30:
        return {"direction":"NEUTRAL","confidence":0.5,"target":bars[-1].c if bars else None}
    closes = [b.c for b in bars]
    up, mid, dn = bbands(closes,20,2.0)
    r = rsi(closes,14); f, s = ema(closes,12), ema(closes,26)

    votes_up = 0; votes_dn = 0
    if bars[-1].c < dn[-1]: votes_up += 1
    if bars[-1].c > up[-1]: votes_dn += 1
    if f[-1] > s[-1]: votes_up += 1
    if f[-1] < s[-1]: votes_dn += 1
    if r[-1] < 35: votes_up += 1
    if r[-1] > 65: votes_dn += 1

    total = 6
    direction = "NEUTRAL" if votes_up == votes_dn else ("BUY" if votes_up > votes_dn else "SELL")
    confidence = max(votes_up, votes_dn)/total
    tgt = mid[-1]
    return {"direction": direction, "confidence": round(confidence,2),
            "target": round_price(tgt, INSTRUMENTS.get(symbol,{}).get("digits",5))}
