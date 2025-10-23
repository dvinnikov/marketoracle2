#property strict
#property version   "1.2"
#property description "MT5 bridge: ticks + snapshots + command poll (compat build)"

input string BASE_URL     = "http://127.0.0.1:8000";
input int    HEARTBEAT_MS = 500;
input int    SNAPSHOT_MS  = 2000;
input bool   INCLUDE_ORDERS = true;

uint     last_snapshot_ms = 0;
ulong    last_cmd_id_executed = 0;

// ---------------- helpers ----------------

int HttpPost(const string path, const string json, string &resp_headers, char &resp[])
{
   // build UTF-8 body without trailing NUL
   char body[];
   int n = StringToCharArray(json, body, 0, -1, CP_UTF8);
   if (n > 0) ArrayResize(body, n - 1);

   string headers = "Content-Type: application/json\r\n";
   return WebRequest("POST", BASE_URL + path, headers, 5000, body, resp, resp_headers);
}

bool SendJson(const string path, const string json)
{
   char resp[]; string hdr;
   int rc = HttpPost(path, json, hdr, resp);
   if (rc == -1)
   {
      int err = GetLastError();
      PrintFormat("POST %s failed: %d", path, err);
      return false;
   }
   return true;
}

string JsonEscape(const string s)
{
   string r = s;
   StringReplace(r, "\\", "\\\\");
   StringReplace(r, "\"", "\\\"");
   return r;
}

// ---------------- streaming ----------------

void SendTick()
{
   const string sym = _Symbol;
   const double bid = SymbolInfoDouble(sym, SYMBOL_BID);
   const double ask = SymbolInfoDouble(sym, SYMBOL_ASK);
   const long   t   = (long)TimeCurrent();

   string j = StringFormat(
      "{\"symbol\":\"%s\",\"bid\":%.10f,\"ask\":%.10f,\"time\":%I64d}",
      JsonEscape(sym), bid, ask, t
   );
   SendJson("/bridge/tick", j);
}

void SendAccountSnapshot()
{
   double balance   = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity    = AccountInfoDouble(ACCOUNT_EQUITY);
   double margin    = AccountInfoDouble(ACCOUNT_MARGIN);
   string currency  = AccountInfoString(ACCOUNT_CURRENCY);
   long   login     = (long)AccountInfoInteger(ACCOUNT_LOGIN);
   string name      = AccountInfoString(ACCOUNT_NAME);
   string server    = AccountInfoString(ACCOUNT_SERVER);

   string j = StringFormat(
      "{\"login\":%I64d,\"name\":\"%s\",\"server\":\"%s\",\"currency\":\"%s\",\"balance\":%.2f,\"equity\":%.2f,\"margin\":%.2f}",
      login, JsonEscape(name), JsonEscape(server), JsonEscape(currency), balance, equity, margin
   );
   SendJson("/bridge/account", j);
}

// Positions snapshot WITHOUT PositionSelectByIndex (compat):
void SendPositionsSnapshot()
{
   int total_syms = SymbolsTotal(true);
   string arr = "[";
   int wrote = 0;

   for (int i = 0; i < total_syms; ++i)
   {
      string sym = SymbolName(i, true);
      if (sym == "") continue;

      if (PositionSelect(sym))
      {
         long   ticket = (long)PositionGetInteger(POSITION_TICKET);
         long   type   = (long)PositionGetInteger(POSITION_TYPE);
         double volume = PositionGetDouble(POSITION_VOLUME);
         double price  = PositionGetDouble(POSITION_PRICE_OPEN);
         double sl     = PositionGetDouble(POSITION_SL);
         double tp     = PositionGetDouble(POSITION_TP);
         double profit = PositionGetDouble(POSITION_PROFIT);
         long   time   = (long)PositionGetInteger(POSITION_TIME);

         if (wrote++ > 0) arr += ",";
         arr += StringFormat(
            "{\"ticket\":%I64d,\"symbol\":\"%s\",\"type\":%d,\"volume\":%.2f,\"price\":%.10f,\"sl\":%.10f,\"tp\":%.10f,\"profit\":%.2f,\"time\":%I64d}",
            ticket, JsonEscape(sym), type, volume, price, sl, tp, profit, time
         );
      }
   }
   arr += "]";
   SendJson("/bridge/positions", "{\"positions\":"+arr+"}");
}

// Orders snapshot WITHOUT SELECT_BY_POS (pure MQL5):
void SendOrdersSnapshot()
{
   if (!INCLUDE_ORDERS) return;

   int total = (int)OrdersTotal();
   string arr = "[";
   for (int i=0; i<total; ++i)
   {
      ulong ticket = OrderGetTicket(i);
      if (ticket == 0) continue;
      if (!OrderSelect(ticket)) continue;

      string sym   = OrderGetString(ORDER_SYMBOL);
      long   type  = (long)OrderGetInteger(ORDER_TYPE);
      double vol   = OrderGetDouble(ORDER_VOLUME_CURRENT);
      double price = OrderGetDouble(ORDER_PRICE_OPEN);
      double sl    = OrderGetDouble(ORDER_SL);
      double tp    = OrderGetDouble(ORDER_TP);
      long   time  = (long)OrderGetInteger(ORDER_TIME_SETUP);

      arr += StringFormat(
         "%s{\"ticket\":%I64d,\"symbol\":\"%s\",\"type\":%d,\"volume\":%.2f,\"price\":%.10f,\"sl\":%.10f,\"tp\":%.10f,\"time\":%I64d}",
         (i>0?",":""), ticket, JsonEscape(sym), type, vol, price, sl, tp, time
      );
   }
   arr += "]";
   SendJson("/bridge/orders", "{\"orders\":"+arr+"}");
}

// ---------- trade helpers (avoid PositionSelectByTicket) ----------

// Find symbol by position ticket (compat way)
bool FindPositionSymbolByTicket(const ulong ticket, string &sym_out, long &type_out)
{
   int total_syms = SymbolsTotal(true);
   for (int i=0; i<total_syms; ++i)
   {
      string sym = SymbolName(i, true);
      if (sym == "") continue;
      if (!PositionSelect(sym)) continue;
      ulong t = (ulong)PositionGetInteger(POSITION_TICKET);
      if (t == ticket)
      {
         sym_out = sym;
         type_out = (long)PositionGetInteger(POSITION_TYPE);
         return true;
      }
   }
   return false;
}

bool ExecuteMarketOrder(const string symbol, const long order_type, const double volume, const double sl, const double tp, ulong &ticket_out)
{
   MqlTradeRequest req; ZeroMemory(req);
   req.action    = TRADE_ACTION_DEAL;
   req.symbol    = symbol;
   req.magic     = 987654321;
   req.volume    = volume;
   req.type      = (ENUM_ORDER_TYPE)order_type;
   req.deviation = 20;
   req.price     = (order_type == ORDER_TYPE_BUY)
                   ? SymbolInfoDouble(symbol, SYMBOL_ASK)
                   : SymbolInfoDouble(symbol, SYMBOL_BID);
   if (sl > 0) req.sl = sl;
   if (tp > 0) req.tp = tp;

   MqlTradeResult res;
   if (!OrderSend(req, res))
   {
      PrintFormat("OrderSend failed: %d", GetLastError());
      return false;
   }
   ticket_out = res.order;
   return (res.retcode == TRADE_RETCODE_DONE || res.retcode == TRADE_RETCODE_PLACED);
}

bool ModifyPositionSLTP(const ulong ticket, const double sl, const double tp)
{
   string sym; long ptype;
   if (!FindPositionSymbolByTicket(ticket, sym, ptype)) return false;

   MqlTradeRequest req; ZeroMemory(req);
   req.action   = TRADE_ACTION_SLTP;
   req.symbol   = sym;
   req.position = ticket;
   if (sl > 0) req.sl = sl;
   if (tp > 0) req.tp = tp;

   MqlTradeResult res;
   if (!OrderSend(req, res))
   {
      PrintFormat("SLTP modify failed: %d", GetLastError());
      return false;
   }
   return (res.retcode == TRADE_RETCODE_DONE);
}

bool ClosePositionByTicket(const ulong ticket)
{
   string sym; long ptype;
   if (!FindPositionSymbolByTicket(ticket, sym, ptype)) return false;

   double vol = PositionGetDouble(POSITION_VOLUME);

   MqlTradeRequest req; ZeroMemory(req);
   req.action   = TRADE_ACTION_DEAL;
   req.symbol   = sym;
   req.position = ticket;
   req.volume   = vol;
   req.deviation= 20;
   req.type     = (ptype == POSITION_TYPE_BUY) ? ORDER_TYPE_SELL : ORDER_TYPE_BUY;
   req.price    = (req.type == ORDER_TYPE_BUY)
                  ? SymbolInfoDouble(sym, SYMBOL_ASK)
                  : SymbolInfoDouble(sym, SYMBOL_BID);

   MqlTradeResult res;
   if (!OrderSend(req, res))
   {
      PrintFormat("Close failed: %d", GetLastError());
      return false;
   }
   return (res.retcode == TRADE_RETCODE_DONE);
}

// ---------------- command polling ----------------

void PollCommands()
{
   string body = StringFormat("{\"after\":%I64d}", (long)last_cmd_id_executed);
   char resp[]; string hdr;
   int rc = HttpPost("/bridge/commands/fetch", body, hdr, resp);
   if (rc == -1) return;

   // Convert char[] -> string (no .Assign in MQL5)
   string s = CharArrayToString(resp, 0, -1, CP_UTF8);

   int pos = 0;
   while ((pos = StringFind(s, "\"id\":", pos)) != -1)
   {
      pos += 5;
      ulong id = (ulong)StringToInteger(StringSubstr(s, pos, 20));

      int tpos = StringFind(s, "\"type\":\"", pos); if (tpos < 0) break;
      tpos += 8; int tend = StringFind(s, "\"", tpos);
      string type = StringSubstr(s, tpos, tend - tpos);

      string symbol=""; double volume=0, sl=0, tp=0; ulong ticket=0;

      int sp = StringFind(s, "\"symbol\":\"", tend); if (sp > 0){ sp += 10; int se = StringFind(s, "\"", sp); symbol = StringSubstr(s, sp, se - sp); }
      int vp = StringFind(s, "\"volume\":",  tend); if (vp > 0){ vp += 9; volume = StringToDouble(StringSubstr(s, vp, 20)); }
      int slp= StringFind(s, "\"sl\":",      tend); if (slp> 0){ slp+= 5; sl     = StringToDouble(StringSubstr(s, slp,20)); }
      int tpp= StringFind(s, "\"tp\":",      tend); if (tpp> 0){ tpp+= 5; tp     = StringToDouble(StringSubstr(s, tpp,20)); }
      int tkp= StringFind(s, "\"ticket\":",  tend); if (tkp> 0){ tkp+= 9; ticket = (ulong)StringToInteger(StringSubstr(s, tkp,20)); }

      bool ok=false;
      if (type == "market")
      {
         long side = (StringFind(s, "\"side\":\"buy\"", tend) >= 0) ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
         ulong out_ticket=0;
         ok = ExecuteMarketOrder(symbol, side, volume, sl, tp, out_ticket);
      }
      else if (type == "modify")
      {
         ok = ModifyPositionSLTP(ticket, sl, tp);
      }
      else if (type == "close")
      {
         ok = ClosePositionByTicket(ticket);
      }

      if (ok) last_cmd_id_executed = id;

      string ack = StringFormat("{\"id\":%I64d,\"ok\":%s}", (long)id, ok?"true":"false");
      SendJson("/bridge/commands/ack", ack);
   }
}

void SendInstrumentList()
{
   int total = SymbolsTotal(true);
   string arr = "[";
   for (int i=0; i<total; ++i)
   {
      string sym = SymbolName(i, true);
      if (sym == "") continue;
      int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
      double point = SymbolInfoDouble(sym, SYMBOL_POINT);
      if (i>0) arr += ",";
      arr += StringFormat("{\"symbol\":\"%s\",\"digits\":%d,\"point\":%.10f}", sym, digits, point);
   }
   arr += "]";
   string body = "{\"symbols\":"+arr+"}";
   SendJson("/bridge/instruments", body);
}


// --------------- EA lifecycle ---------------

int OnInit()
{
   Print("MT5BridgePro_Compat initialized. Endpoint: ", BASE_URL);
   last_snapshot_ms = GetTickCount();
   SendInstrumentList();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   SendJson("/bridge/status", "{\"status\":\"stopped\"}");
}

void OnTick()
{
   SendTick();

   uint now = GetTickCount();
   if (now - last_snapshot_ms >= (uint)SNAPSHOT_MS)
   {
      SendAccountSnapshot();
      SendPositionsSnapshot();
      if (INCLUDE_ORDERS) SendOrdersSnapshot();
      last_snapshot_ms = now;
   }

   PollCommands();
   Sleep(HEARTBEAT_MS);
}
