import math
from collections import deque
from typing import Deque, List, Tuple, Optional

def ema(vals: List[float], period: int) -> List[float]:
    k = 2 / (period + 1)
    out, s = [], None
    for v in vals:
        s = v if s is None else (v - s) * k + s
        out.append(s)
    return out

def rsi(vals: List[float], period: int=14) -> List[float]:
    gains, losses = 0.0, 0.0
    rsis = [50.0]*len(vals)
    for i in range(1, len(vals)):
        ch = vals[i]-vals[i-1]
        g = max(0.0, ch); l = max(0.0, -ch)
        if i <= period:
            gains += g; losses += l
        else:
            gains = (gains*(period-1)+g)/period
            losses = (losses*(period-1)+l)/period
            rs = gains/(losses+1e-9)
            rsis[i] = 100.0 - (100.0/(1.0+rs))
    return rsis

def macd(vals: List[float], fast=12, slow=26, signal=9) -> Tuple[List[float], List[float], List[float]]:
    from .indicators import ema as _ema
    macd_line = [a-b for a,b in zip(_ema(vals, fast), _ema(vals, slow))]
    signal_line = _ema(macd_line, signal)
    hist = [m-s for m,s in zip(macd_line, signal_line)]
    return macd_line, signal_line, hist

def bbands(vals: List[float], period=20, mult=2.0) -> Tuple[List[float], List[float], List[float]]:
    up, mid, dn = [], [], []
    win: Deque[float] = deque(maxlen=period)
    for v in vals:
        win.append(v)
        m = sum(win)/len(win)
        var = sum((x-m)**2 for x in win)/max(1, len(win))
        sd = math.sqrt(var)
        mid.append(m); up.append(m+mult*sd); dn.append(m-mult*sd)
    return up, mid, dn

def swings(vals: List[float], lookback=5):
    hi, lo = [None]*len(vals), [None]*len(vals)
    for i in range(lookback, len(vals)-lookback):
        if vals[i] == max(vals[i-lookback:i+lookback+1]): hi[i] = vals[i]
        if vals[i] == min(vals[i-lookback:i+lookback+1]): lo[i] = vals[i]
    return hi, lo
