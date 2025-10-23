import time, math
from typing import Optional

def now_ts() -> int:
    return int(time.time())

def to_res_sec(tf: str | int) -> int:
    if isinstance(tf, int): return tf
    m = tf.strip().lower()
    if m.endswith("m"): return int(m[:-1]) * 60
    if m.endswith("h"): return int(m[:-1]) * 3600
    if m.endswith("d"): return int(m[:-1]) * 86400
    return int(m)

def round_price(p: float, digits: int = 5) -> float:
    k = 10 ** digits
    return math.floor(p * k + 0.5) / k

def fmt_day(ts: int) -> str:
    return time.strftime("%Y-%m-%d", time.gmtime(ts))
