# MT5 Backend Bridge — README (Setup & Run)

A minimal, local-first backend that bridges **MetaTrader 5** (MT5) to a **FastAPI** server.  
It streams live ticks/candles, exposes account/positions, lets your app place/modify/close orders, runs real-time strategies with logs, and returns a lightweight market prediction.  

This repo contains:
- `server.py` — FastAPI backend (REST + WebSocket + bridge endpoints)
- `api-tester.html` — one-file HTML client to exercise all APIs
- `MT5BridgePro_Compat.mq5` — MT5 Expert Advisor (EA) that streams data and executes commands

---

## 1) Prerequisites

- **Python 3.10+** (tested with 3.12)
- **MetaTrader 5** desktop (Windows)
- Internet OFF is fine; everything runs on **localhost**
- Optional: `git`, `curl`

---

## 2) Clone & Install

```bash
git clone <your-repo-url> mt5-backend
cd mt5-backend

# create and activate a venv (recommended)
python -m venv .venv
# Windows:
. .venv/Scripts/activate
# macOS/Linux:
# source .venv/bin/activate

pip install --upgrade pip
pip install fastapi uvicorn pydantic pydantic-settings
```

---

## 3) Place the EA in MT5

1. Open **MetaTrader 5** → `File` → `Open Data Folder`.  
2. Navigate to: `MQL5/Experts/`  
3. Copy **`MT5BridgePro_Compat.mq5`** into `Experts/`.  
4. In MT5, open **MetaEditor** → compile the EA.
5. In MT5: **Tools → Options → Expert Advisors**  
   - Check **Allow WebRequest for listed URL**  
   - Add: `http://127.0.0.1:8000`
6. In the **Navigator** panel, under **Experts**, drag **MT5BridgePro_Compat** onto a chart (e.g., `EURUSD`, M1).  
   - Enable **Algo Trading** (toolbar button should be green).

> Optional: to pre-register all Market Watch symbols, enable the `SendInstrumentList()` call in `OnInit()` inside the EA (comment provided in file).

---

## 4) Run the Backend

```bash
# from the repo root
python -m uvicorn server:app --reload --port 8000
```

You should see:
```
Uvicorn running on http://127.0.0.1:8000
Application startup complete.
```

### Quick health check
- Browser: `http://127.0.0.1:8000/healthz`  
- Should return `{"ok": true, ... }`

If you see `ERR_CONNECTION_REFUSED`, the server isn’t running on that port yet (or just reloaded). Start it (or update the tester’s Base URL accordingly).

---

## 5) Test All APIs (no code needed)

Open **`api-tester.html`** in your browser.

- Set **Base URL** to `http://127.0.0.1:8000`
- Use the buttons to exercise:
  - `GET /api/instruments`, `/api/account`, `/api/positions`, `/api/orders`
  - `GET /api/candles?symbol=EURUSD&timeframe=60&limit=100`
  - Place order: `POST /api/order/market`
  - Modify/close: `POST /api/position/modify`, `POST /api/position/close`
  - Start strategies: `POST /api/strategies/start`
  - Subscribe to WebSockets: ticks, bars, signals, prediction

> **Note:** `/api/instruments` lists symbols **seen** so far (from ticks/positions/orders).  
> You can seed more via:
> ```
> POST /api/instruments/register
> { "symbol":"GBPUSD", "digits":5, "point":0.00001 }
> ```

---

## 6) Core Endpoints

### REST
- `GET /healthz` → server status
- `GET /api/instruments` → `{ symbols, meta }`
- `POST /api/instruments/register` → seed symbols manually
- `GET /api/account` → account snapshot
- `GET /api/positions` → open positions
- `GET /api/orders` → open/pending orders
- `GET /api/candles?symbol=EURUSD&timeframe=60&limit=500&before=ts` → OHLCV
- `POST /api/order/market` → `{symbol, side:"buy"|"sell", volume, sl?, tp?}`
- `POST /api/position/modify` → `{ticket, sl?, tp?}`
- `POST /api/position/close` → `{ticket}`
- `GET /api/strategies` → catalog
- `POST /api/strategies/start` → `{symbol, tf:"60"|"15m"|"1h"|..., strategies?:string[]}`
- `POST /api/strategies/stop` → `{id: "SYMBOL:RES_IN_SEC"}`
- `GET /api/signals` → strategy logs
- `GET /api/prediction?symbol=...&tf=...` → simple ensemble: `{direction, confidence, target}`

### WebSockets
- `ws://127.0.0.1:8000/ws/ticks?symbol=EURUSD` → live ticks
- `ws://127.0.0.1:8000/ws/bars?symbol=EURUSD&res=60` → live bars
- `ws://127.0.0.1:8000/ws/signals` → real-time strategy logs
- `ws://127.0.0.1:8000/ws/prediction?symbol=EURUSD&tf=60` → prediction on each bar close

### Bridge (called by the EA)
- `POST /bridge/tick` — live tick stream
- `POST /bridge/account`, `/bridge/positions`, `/bridge/orders` — snapshots
- `POST /bridge/instruments` — optional symbol list from Market Watch
- `POST /bridge/commands/fetch` — EA polls queued commands (`{"after": <id>}`)
- `POST /bridge/commands/ack` — EA acknowledges execution
- `POST /bridge/status` — lifecycle pings

---

## 7) Quick cURL examples

```bash
# Seed an instrument (optional)
curl -X POST http://127.0.0.1:8000/api/instruments/register   -H "Content-Type: application/json"   -d '{"symbol":"USDJPY","digits":3,"point":0.001}'

# Place a market order
curl -X POST http://127.0.0.1:8000/api/order/market   -H "Content-Type: application/json"   -d '{"symbol":"EURUSD","side":"buy","volume":0.10,"sl":1.0820,"tp":1.0870}'

# Start strategies (EURUSD, 1-minute)
curl -X POST http://127.0.0.1:8000/api/strategies/start   -H "Content-Type: application/json"   -d '{"symbol":"EURUSD","tf":"60","strategies":["RSI Crossover","EMA Crossover"]}'
```

---

## 8) Troubleshooting

- **`ERR_CONNECTION_REFUSED`**: server not running / wrong port. Start uvicorn on port 8000 or update the tester’s Base URL.
- **500 on `/bridge/tick`** with JSON decode errors: ensure EA uses the NUL-trim fix (already in `MT5BridgePro_Compat.mq5`) and MT5 **Allow WebRequest** is set to `http://127.0.0.1:8000`.
- **No instruments except EURUSD**: your EA is attached only to EURUSD.  
  - Attach EA to more charts, or  
  - Call `POST /api/instruments/register`, or  
  - Enable EA’s `SendInstrumentList()` on `OnInit()` to push Market Watch symbols.
- **Orders not executing**: verify Algo Trading is **enabled** (green) and the EA is **on a chart**. Check MT5 **Experts** tab for error codes.
- **Firewall prompts**: allow MT5 and Python/uvicorn to communicate on `127.0.0.1:8000`.

---

## 9) Notes & Next Steps

- This backend is **in-memory**. For production, add persistence (SQLite/Postgres) for signals, commands, and fills, plus authentication.
- Strategies are intentionally compact and dependency-free; you can swap to TA-Lib/pandas-ta later.
- For multiple terminals or remote usage, expose the server with proper TLS/auth and change the EA `BASE_URL`.
- The EA is **compat-safe** for conservative MT5 builds (no `PositionSelectByIndex`, no `Assign`, etc.).

---

## 10) License

MIT (or your choice). Add your license file and update this line accordingly.
