# backend/app/strategies.py
from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, List, Literal, Optional, Tuple
import time
import math

# Expect OHLC arrays or list[dict] bars from your data layer:
# bars[-1] is the latest completed/streaming bar:
# { "t": unix_sec, "o": float, "h": float, "l": float, "c": float }

Side = Literal["BUY", "SELL"]
Status = Literal["ACTIVE", "CLOSED", "STOPPED"]

@dataclass
class Signal:
    at: int
    symbol: str
    strategy: str
    side: Side
    entry: float
    stop: float
    target: float
    status: Status = "ACTIVE"
    result: Optional[Literal["WIN", "LOSS"]] = None
    pnl: Optional[float] = None


# ---------- small helpers (no external deps) ----------
def sma(values: List[float], n: int) -> List[float]:
    out: List[float] = []
    s = 0.0
    for i, v in enumerate(values):
        s += v
        if i >= n:
            s -= values[i - n]
        if i >= n - 1:
            out.append(s / n)
        else:
            out.append(math.nan)
    return out

def ema(values: List[float], n: int) -> List[float]:
    out = [math.nan] * len(values)
    if not values or n <= 1:
        return out
    k = 2.0 / (n + 1)
    # seed with SMA(n)
    seed = sum(values[:n]) / n if len(values) >= n else values[0]
    out[n - 1] = seed
    for i in range(n, len(values)):
        out[i] = values[i] * k + out[i - 1] * (1 - k)
    return out

def true_range(h: List[float], l: List[float], c: List[float]) -> List[float]:
    tr = [math.nan] * len(c)
    if not c:
        return tr
    tr[0] = h[0] - l[0]
    for i in range(1, len(c)):
        tr[i] = max(h[i]-l[i], abs(h[i]-c[i-1]), abs(l[i]-c[i-1]))
    return tr

def rsi(closes: List[float], period: int) -> List[float]:
    if period <= 0 or len(closes) < period + 1:
        return [math.nan] * len(closes)
    gains = [0.0]
    losses = [0.0]
    for i in range(1, len(closes)):
        ch = closes[i] - closes[i - 1]
        gains.append(max(ch, 0.0))
        losses.append(max(-ch, 0.0))
    avg_gain = [math.nan] * len(closes)
    avg_loss = [math.nan] * len(closes)
    rsival = [math.nan] * len(closes)
    g = sum(gains[1:period+1]) / period
    lo = sum(losses[1:period+1]) / period
    avg_gain[period] = g
    avg_loss[period] = lo
    rsival[period] = 100.0 if lo == 0 else 100 - 100 / (1 + g/lo)
    for i in range(period + 1, len(closes)):
        g = (avg_gain[i - 1] * (period - 1) + gains[i]) / period
        lo = (avg_loss[i - 1] * (period - 1) + losses[i]) / period
        avg_gain[i] = g
        avg_loss[i] = lo
        rsival[i] = 100.0 if lo == 0 else 100 - 100 / (1 + g/lo)
    return rsival

def stoch_rsi(closes: List[float], rsi_period: int, stoch_period: int) -> List[float]:
    base = rsi(closes, rsi_period)
    out = [math.nan]*len(closes)
    for i in range(len(closes)):
        if i < stoch_period-1:
            continue
        window = [x for x in base[i-stoch_period+1:i+1] if not math.isnan(x)]
        if not window:
            continue
        mn = min(window)
        mx = max(window)
        out[i] = 0 if mx == mn else (base[i] - mn) / (mx - mn) * 100.0
    return out

def adx(h: List[float], l: List[float], c: List[float], period: int) -> List[float]:
    # Simplified ADX
    if len(c) < period + 2:
        return [math.nan] * len(c)
    plus_dm = [0.0] * len(c)
    minus_dm = [0.0] * len(c)
    for i in range(1, len(c)):
        up = h[i] - h[i-1]
        dn = l[i-1] - l[i]
        plus_dm[i] = up if (up > dn and up > 0) else 0.0
        minus_dm[i] = dn if (dn > up and dn > 0) else 0.0
    tr = true_range(h, l, c)
    atr = ema(tr, period)
    pdi = [math.nan] * len(c)
    mdi = [math.nan] * len(c)
    dx = [math.nan] * len(c)
    for i in range(len(c)):
        if math.isnan(atr[i]) or atr[i] == 0:
            continue
        pdi[i] = 100.0 * ema(plus_dm, period)[i] / atr[i]
        mdi[i] = 100.0 * ema(minus_dm, period)[i] / atr[i]
        if pdi[i] is None or mdi[i] is None or math.isnan(pdi[i]) or math.isnan(mdi[i]) or (pdi[i] + mdi[i]) == 0:
            continue
        dx[i] = 100.0 * abs(pdi[i] - mdi[i]) / (pdi[i] + mdi[i])
    return ema([0 if math.isnan(x) else x for x in dx], period)

def atr(h: List[float], l: List[float], c: List[float], period: int) -> List[float]:
    return ema(true_range(h, l, c), period)

def keltner_channels(h: List[float], l: List[float], c: List[float], ema_len: int, atr_len: int, mult: float) -> Tuple[List[float], List[float], List[float]]:
    mid = ema(c, ema_len)
    a = atr(h, l, c, atr_len)
    upper = [ (mid[i] + mult * a[i]) if not math.isnan(mid[i]) and not math.isnan(a[i]) else math.nan for i in range(len(c)) ]
    lower = [ (mid[i] - mult * a[i]) if not math.isnan(mid[i]) and not math.isnan(a[i]) else math.nan for i in range(len(c)) ]
    return lower, mid, upper

def supertrend(h: List[float], l: List[float], c: List[float], atr_len: int, mult: float) -> List[float]:
    # Basic supertrend line (final upper/lower flip). Returns trend line; if close < line -> downtrend.
    n = len(c)
    st = [math.nan]*n
    a = atr(h, l, c, atr_len)
    basic_upper = [ (h[i] + l[i]) / 2 + mult * a[i] if not math.isnan(a[i]) else math.nan for i in range(n) ]
    basic_lower = [ (h[i] + l[i]) / 2 - mult * a[i] if not math.isnan(a[i]) else math.nan for i in range(n) ]
    final_upper = [math.nan]*n
    final_lower = [math.nan]*n
    for i in range(n):
        if i == 0:
            final_upper[i] = basic_upper[i]
            final_lower[i] = basic_lower[i]
            continue
        final_upper[i] = basic_upper[i] if (math.isnan(final_upper[i-1]) or basic_upper[i] < final_upper[i-1] or c[i-1] > final_upper[i-1]) else final_upper[i-1]
        final_lower[i] = basic_lower[i] if (math.isnan(final_lower[i-1]) or basic_lower[i] > final_lower[i-1] or c[i-1] < final_lower[i-1]) else final_lower[i-1]
        if math.isnan(st[i-1]):
            st[i] = final_upper[i] if c[i] <= final_upper[i] else final_lower[i]
        else:
            st[i] = final_upper[i] if (st[i-1] == final_upper[i-1] and c[i] <= final_upper[i]) else final_lower[i]
    return st


# ---------- existing strategies (short forms) ----------
def strat_rsi_crossover(symbol: str, bars: List[dict], params: Dict) -> Optional[Signal]:
    period = int(params.get("rsi_period", 14))
    ob = float(params.get("overbought", 70))
    os = float(params.get("oversold", 30))
    c = [b["c"] for b in bars]
    r = rsi(c, period)
    i = len(c) - 1
    if i < 2 or math.isnan(r[i]) or math.isnan(r[i-1]): return None
    # simple cross back through thresholds
    if r[i-1] < os and r[i] >= os:
        entry = bars[i]["c"]; stop = bars[i]["l"]; target = entry + (entry - stop) * 1.5
        return Signal(bars[i]["t"], symbol, "RSI Crossover", "BUY", entry, stop, target)
    if r[i-1] > ob and r[i] <= ob:
        entry = bars[i]["c"]; stop = bars[i]["h"]; target = entry - (stop - entry) * 1.5
        return Signal(bars[i]["t"], symbol, "RSI Crossover", "SELL", entry, stop, target)
    return None

def strat_macd_divergence(symbol: str, bars: List[dict], params: Dict) -> Optional[Signal]:
    fast = int(params.get("fast", 12)); slow = int(params.get("slow", 26)); sig = int(params.get("signal", 9))
    c = [b["c"] for b in bars]
    ema_fast = ema(c, fast)
    ema_slow = ema(c, slow)
    macd = [ (ema_fast[i] - ema_slow[i]) if not (math.isnan(ema_fast[i]) or math.isnan(ema_slow[i])) else math.nan for i in range(len(c)) ]
    macd_sig = ema(macd, sig)
    i = len(c) - 1
    if i < 2 or math.isnan(macd[i]) or math.isnan(macd_sig[i-1]) or math.isnan(macd_sig[i]): return None
    # simple cross
    if macd[i-1] < macd_sig[i-1] and macd[i] > macd_sig[i]:
        entry = bars[i]["c"]; stop = bars[i]["l"]; target = entry + (entry - stop) * 2.0
        return Signal(bars[i]["t"], symbol, "MACD Divergence", "BUY", entry, stop, target)
    if macd[i-1] > macd_sig[i-1] and macd[i] < macd_sig[i]:
        entry = bars[i]["c"]; stop = bars[i]["h"]; target = entry - (stop - entry) * 2.0
        return Signal(bars[i]["t"], symbol, "MACD Divergence", "SELL", entry, stop, target)
    return None

def strat_bollinger_bounce(symbol: str, bars: List[dict], params: Dict) -> Optional[Signal]:
    n = int(params.get("length", 20)); mult = float(params.get("mult", 2.0))
    c = [b["c"] for b in bars]
    m = sma(c, n)
    # stdev (simple)
    sd = [math.nan]*len(c)
    for i in range(len(c)):
        if i < n-1: continue
        window = c[i-n+1:i+1]
        mean = m[i]
        sd[i] = math.sqrt(sum((x-mean)**2 for x in window)/n)
    upper = [ (m[i] + mult*sd[i]) if not (math.isnan(m[i]) or math.isnan(sd[i])) else math.nan for i in range(len(c)) ]
    lower = [ (m[i] - mult*sd[i]) if not (math.isnan(m[i]) or math.isnan(sd[i])) else math.nan for i in range(len(c)) ]
    i = len(c) - 1
    if i < 2 or math.isnan(lower[i]) or math.isnan(upper[i]): return None
    # bounce off bands
    if c[i-1] < lower[i-1] and c[i] > lower[i]:
        entry = bars[i]["c"]; stop = bars[i]["l"]; target = upper[i] if not math.isnan(upper[i]) else entry + (entry - stop) * 1.5
        return Signal(bars[i]["t"], symbol, "Bollinger Bounce", "BUY", entry, stop, target)
    if c[i-1] > upper[i-1] and c[i] < upper[i]:
        entry = bars[i]["c"]; stop = bars[i]["h"]; target = lower[i] if not math.isnan(lower[i]) else entry - (stop - entry) * 1.5
        return Signal(bars[i]["t"], symbol, "Bollinger Bounce", "SELL", entry, stop, target)
    return None

def strat_ema_crossover(symbol: str, bars: List[dict], params: Dict) -> Optional[Signal]:
    fast = int(params.get("fast", 9)); slow = int(params.get("slow", 21))
    c = [b["c"] for b in bars]
    ef = ema(c, fast); es = ema(c, slow)
    i = len(c)-1
    if i < 2 or math.isnan(ef[i]) or math.isnan(es[i]) or math.isnan(ef[i-1]) or math.isnan(es[i-1]): return None
    if ef[i-1] <= es[i-1] and ef[i] > es[i]:
        entry = bars[i]["c"]; stop = bars[i]["l"]; target = entry + (entry - stop) * 2.0
        return Signal(bars[i]["t"], symbol, "EMA Crossover", "BUY", entry, stop, target)
    if ef[i-1] >= es[i-1] and ef[i] < es[i]:
        entry = bars[i]["c"]; stop = bars[i]["h"]; target = entry - (stop - entry) * 2.0
        return Signal(bars[i]["t"], symbol, "EMA Crossover", "SELL", entry, stop, target)
    return None

def strat_support_resistance(symbol: str, bars: List[dict], params: Dict) -> Optional[Signal]:
    lookback = int(params.get("lookback", 20))
    if len(bars) < lookback + 2: return None
    i = len(bars)-1
    highs = [b["h"] for b in bars]
    lows = [b["l"] for b in bars]
    recent_high = max(highs[i-lookback+1:i+1])
    recent_low = min(lows[i-lookback+1:i+1])
    price = bars[i]["c"]
    tol = float(params.get("tolerance", 0.0005))
    if abs(price - recent_low) <= tol:
        entry = price; stop = min(lows[i-lookback+1:i+1]); target = recent_high
        return Signal(bars[i]["t"], symbol, "Support/Resistance", "BUY", entry, stop, target)
    if abs(price - recent_high) <= tol:
        entry = price; stop = max(highs[i-lookback+1:i+1]); target = recent_low
        return Signal(bars[i]["t"], symbol, "Support/Resistance", "SELL", entry, stop, target)
    return None


# ---------- NEW strategies (6) ----------

def strat_supertrend(symbol: str, bars: List[dict], params: Dict) -> Optional[Signal]:
    atr_len = int(params.get("atr_len", 10))
    mult = float(params.get("mult", 3.0))
    h = [b["h"] for b in bars]; l = [b["l"] for b in bars]; c = [b["c"] for b in bars]
    st = supertrend(h, l, c, atr_len, mult)
    i = len(c)-1
    if i < 2 or math.isnan(st[i]) or math.isnan(st[i-1]): return None
    # Bullish when close > supertrend line; bearish when close < line.
    if c[i-1] <= st[i-1] and c[i] > st[i]:
        entry = c[i]; stop = l[i]; target = entry + (entry - stop) * 2.0
        return Signal(bars[i]["t"], symbol, "Supertrend Trend-Follow", "BUY", entry, stop, target)
    if c[i-1] >= st[i-1] and c[i] < st[i]:
        entry = c[i]; stop = h[i]; target = entry - (stop - entry) * 2.0
        return Signal(bars[i]["t"], symbol, "Supertrend Trend-Follow", "SELL", entry, stop, target)
    return None

def strat_donchian_breakout(symbol: str, bars: List[dict], params: Dict) -> Optional[Signal]:
    ch_len = int(params.get("channel_len", 20))
    if len(bars) < ch_len + 1: return None
    i = len(bars)-1
    highs = [b["h"] for b in bars]; lows = [b["l"] for b in bars]
    up = max(highs[i-ch_len+1:i+1])
    dn = min(lows[i-ch_len+1:i+1])
    price = bars[i]["c"]
    if price > up:
        entry = price; stop = dn; target = entry + (up - dn)  # 1R move
        return Signal(bars[i]["t"], symbol, "Donchian Channel Breakout", "BUY", entry, stop, target)
    if price < dn:
        entry = price; stop = up; target = entry - (up - dn)
        return Signal(bars[i]["t"], symbol, "Donchian Channel Breakout", "SELL", entry, stop, target)
    return None

def strat_ichimoku_breakout(symbol: str, bars: List[dict], params: Dict) -> Optional[Signal]:
    conv = int(params.get("conversion", 9))
    base = int(params.get("base", 26))
    span_b = int(params.get("span_b", 52))
    if len(bars) < max(conv, base, span_b) + 2: return None
    highs = [b["h"] for b in bars]; lows = [b["l"] for b in bars]; c = [b["c"] for b in bars]
    def hl_mid(src_h, src_l, n, i):
        s = src_h[i-n+1:i+1]; t = src_l[i-n+1:i+1]
        return (max(s) + min(t)) / 2.0
    i = len(bars)-1
    conv_now = hl_mid(highs, lows, conv, i)
    base_now = hl_mid(highs, lows, base, i)
    span_a = (conv_now + base_now) / 2.0
    span_b_now = hl_mid(highs, lows, span_b, i)
    cloud_top = max(span_a, span_b_now)
    cloud_bot = min(span_a, span_b_now)
    # bullish if close crosses above cloud, bearish if below
    if c[i-1] <= cloud_top and c[i] > cloud_top:
        entry = c[i]; stop = cloud_bot; target = entry + (entry - stop) * 2.0
        return Signal(bars[i]["t"], symbol, "Ichimoku Cloud Breakout", "BUY", entry, stop, target)
    if c[i-1] >= cloud_bot and c[i] < cloud_bot:
        entry = c[i]; stop = cloud_top; target = entry - (stop - entry) * 2.0
        return Signal(bars[i]["t"], symbol, "Ichimoku Cloud Breakout", "SELL", entry, stop, target)
    return None

def strat_adx_ema_pullback(symbol: str, bars: List[dict], params: Dict) -> Optional[Signal]:
    ema_len = int(params.get("ema_len", 50))
    adx_len = int(params.get("adx_len", 14))
    adx_thr = float(params.get("adx_thr", 20.0))
    c = [b["c"] for b in bars]; h = [b["h"] for b in bars]; l = [b["l"] for b in bars]
    e = ema(c, ema_len); a = adx(h, l, c, adx_len)
    i = len(c)-1
    if i < 2 or math.isnan(e[i]) or math.isnan(a[i])): return None
    # strong trend filter + pullback to EMA
    if a[i] >= adx_thr:
        if c[i-1] < e[i-1] and c[i] > e[i]:  # pullback end in uptrend
            entry = c[i]; stop = l[i]; target = entry + (entry - stop) * 2.0
            return Signal(bars[i]["t"], symbol, "ADX + EMA Trend Pullback", "BUY", entry, stop, target)
        if c[i-1] > e[i-1] and c[i] < e[i]:  # pullback end in downtrend
            entry = c[i]; stop = h[i]; target = entry - (stop - entry) * 2.0
            return Signal(bars[i]["t"], symbol, "ADX + EMA Trend Pullback", "SELL", entry, stop, target)
    return None

def strat_keltner_mean_reversion(symbol: str, bars: List[dict], params: Dict) -> Optional[Signal]:
    ema_len = int(params.get("ema_len", 20))
    atr_len = int(params.get("atr_len", 10))
    mult = float(params.get("mult", 1.5))
    h = [b["h"] for b in bars]; l = [b["l"] for b in bars]; c = [b["c"] for b in bars]
    lower, mid, upper = keltner_channels(h, l, c, ema_len, atr_len, mult)
    i = len(c)-1
    if i < 2 or math.isnan(lower[i]) or math.isnan(upper[i]) or math.isnan(mid[i])): return None
    # reversion when close re-enters channel
    if c[i-1] < lower[i-1] and c[i] >= lower[i]:
        entry = c[i]; stop = l[i]; target = mid[i]
        return Signal(bars[i]["t"], symbol, "Keltner Channel Mean Reversion", "BUY", entry, stop, target)
    if c[i-1] > upper[i-1] and c[i] <= upper[i]:
        entry = c[i]; stop = h[i]; target = mid[i]
        return Signal(bars[i]["t"], symbol, "Keltner Channel Mean Reversion", "SELL", entry, stop, target)
    return None

def strat_stoch_rsi_reversal(symbol: str, bars: List[dict], params: Dict) -> Optional[Signal]:
    rsi_len = int(params.get("rsi_len", 14))
    stoch_len = int(params.get("stoch_len", 14))
    overbought = float(params.get("overbought", 80.0))
    oversold = float(params.get("oversold", 20.0))
    c = [b["c"] for b in bars]
    k = stoch_rsi(c, rsi_len, stoch_len)
    i = len(c)-1
    if i < 2 or math.isnan(k[i]) or math.isnan(k[i-1])): return None
    if k[i-1] < oversold and k[i] >= oversold:
        entry = c[i]; stop = bars[i]["l"]; target = entry + (entry - stop) * 1.5
        return Signal(bars[i]["t"], symbol, "Stochastic RSI Reversal", "BUY", entry, stop, target)
    if k[i-1] > overbought and k[i] <= overbought:
        entry = c[i]; stop = bars[i]["h"]; target = entry - (stop - entry) * 1.5
        return Signal(bars[i]["t"], symbol, "Stochastic RSI Reversal", "SELL", entry, stop, target)
    return None


# ---------- strategy registry & API wiring ----------

# Ordered catalog the UI will render
CATALOG: List[Tuple[str, str, callable]] = [
    ("RSI Crossover", "Momentum reversal on RSI thresholds", strat_rsi_crossover),
    ("MACD Divergence", "Signal-line crosses for momentum shifts", strat_macd_divergence),
    ("Bollinger Bounce", "Mean reversion at Bollinger bands", strat_bollinger_bounce),
    ("EMA Crossover", "Fast/slow EMA trend shifts", strat_ema_crossover),
    ("Support/Resistance", "Rebounds at recent S/R zones", strat_support_resistance),

    # New 6
    ("Supertrend Trend-Follow", "ATR-based trend with dynamic stopline", strat_supertrend),
    ("Donchian Channel Breakout", "Breakout of N-bar high/low channel", strat_donchian_breakout),
    ("Ichimoku Cloud Breakout", "Cloud break momentum entries", strat_ichimoku_breakout),
    ("ADX + EMA Trend Pullback", "Enter pullbacks within strong ADX trend", strat_adx_ema_pullback),
    ("Keltner Channel Mean Reversion", "Revert to mid after band pierce", strat_keltner_mean_reversion),
    ("Stochastic RSI Reversal", "Reversal when StochRSI exits extremes", strat_stoch_rsi_reversal),
]

# Defaults used by your /api/strategies endpoint (and UI param editor)
DEFAULT_PARAMS: Dict[str, Dict[str, float]] = {
    "RSI Crossover": {"rsi_period": 14, "overbought": 70, "oversold": 30},
    "MACD Divergence": {"fast": 12, "slow": 26, "signal": 9},
    "Bollinger Bounce": {"length": 20, "mult": 2.0},
    "EMA Crossover": {"fast": 9, "slow": 21},
    "Support/Resistance": {"lookback": 20, "tolerance": 0.0005},

    "Supertrend Trend-Follow": {"atr_len": 10, "mult": 3.0},
    "Donchian Channel Breakout": {"channel_len": 20},
    "Ichimoku Cloud Breakout": {"conversion": 9, "base": 26, "span_b": 52},
    "ADX + EMA Trend Pullback": {"ema_len": 50, "adx_len": 14, "adx_thr": 20.0},
    "Keltner Channel Mean Reversion": {"ema_len": 20, "atr_len": 10, "mult": 1.5},
    "Stochastic RSI Reversal": {"rsi_len": 14, "stoch_len": 14, "overbought": 80.0, "oversold": 20.0},
}

def catalog() -> List[Dict[str, str]]:
    """For GET /api/strategies → { catalog: [{name, desc}], params: {name: {k:v}} }"""
    return [{"name": name, "desc": desc} for name, desc, _fn in CATALOG]

def default_params() -> Dict[str, Dict[str, float]]:
    return DEFAULT_PARAMS

def run_all(
    symbol: str,
    bars: List[dict],
    enabled_names: List[str],
    params_map: Optional[Dict[str, Dict[str, float]]] = None
) -> List[Signal]:
    """Run enabled strategies and return any fresh signals from the latest bar."""
    name_to_fn = {name: fn for name, _desc, fn in CATALOG}
    out: List[Signal] = []
    for name in enabled_names:
        fn = name_to_fn.get(name)
        if not fn:
            continue
        p = (params_map or {}).get(name, DEFAULT_PARAMS.get(name, {}))
        sig = fn(symbol, bars, p)
        if sig:
            out.append(sig)
    return out
