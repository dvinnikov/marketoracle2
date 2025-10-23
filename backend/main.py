from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.state import on_startup, on_shutdown
from app.routers import public, bridge, ws

app = FastAPI(title="MT5 Bridge · Strategies · Paper Trading")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

app.include_router(public.router)
app.include_router(bridge.router)
app.include_router(ws.router)

@app.on_event("startup")
async def _startup():
    await on_startup(app)

@app.on_event("shutdown")
async def _shutdown():
    await on_shutdown(app)
