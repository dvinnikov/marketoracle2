from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import asyncio
from ..state import WS_TICKS, WS_BARS, WS_SIGNALS, WS_PRED, WS_PRED_LOG, BARS
from ..utils import to_res_sec

router = APIRouter()

@router.websocket("/ws/ticks")
async def ws_ticks(ws: WebSocket, symbol: str):
    await ws.accept()
    WS_TICKS[symbol].append(ws)
    try:
        while True:
            await asyncio.sleep(3600)
    except WebSocketDisconnect:
        pass
    finally:
        if ws in WS_TICKS[symbol]: WS_TICKS[symbol].remove(ws)

@router.websocket("/ws/bars")
async def ws_bars(ws: WebSocket, symbol: str, res: int = 60):
    await ws.accept()
    WS_BARS[(symbol,res)].append(ws)
    # bootstrap last bar so charts paint immediately
    arr = list(BARS.get((symbol,res), []))
    if arr:
        await ws.send_json({"symbol":symbol,"res":res,"bar": arr[-1].__dict__})
    try:
        while True:
            await asyncio.sleep(3600)
    except WebSocketDisconnect:
        pass
    finally:
        if ws in WS_BARS[(symbol,res)]: WS_BARS[(symbol,res)].remove(ws)

@router.websocket("/ws/signals")
async def ws_signals(ws: WebSocket):
    await ws.accept()
    WS_SIGNALS.append(ws)
    try:
        while True:
            await asyncio.sleep(3600)
    except WebSocketDisconnect:
        pass
    finally:
        if ws in WS_SIGNALS: WS_SIGNALS.remove(ws)

@router.websocket("/ws/prediction")
async def ws_prediction(ws: WebSocket, symbol: str, tf: str = "60"):
    res = to_res_sec(tf)
    await ws.accept()
    WS_PRED[(symbol,res)].append(ws)
    try:
        while True:
            await asyncio.sleep(3600)
    except WebSocketDisconnect:
        pass
    finally:
        if ws in WS_PRED[(symbol,res)]: WS_PRED[(symbol,res)].remove(ws)

@router.websocket("/ws/predictions_log")
async def ws_predictions_log(ws: WebSocket, symbol: str, tf: str = "60"):
    res = to_res_sec(tf)
    await ws.accept()
    WS_PRED_LOG[(symbol,res)].append(ws)
    # bootstrap: sent in runners when connection occurs; here we just park
    try:
        while True:
            await asyncio.sleep(3600)
    except WebSocketDisconnect:
        pass
    finally:
        if ws in WS_PRED_LOG[(symbol,res)]: WS_PRED_LOG[(symbol,res)].remove(ws)
