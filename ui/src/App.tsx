import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, PauseCircle, PlayCircle } from 'lucide-react';
import { ForexChart, Candle, PriceTarget } from './components/ForexChart';
import { StrategySelector, Strategy } from './components/StrategySelector';
import { SignalLogs, SignalLog } from './components/SignalLogs';
import { InstrumentSelector, InstrumentOption } from './components/InstrumentSelector';
import { PredictionPanel } from './components/PredictionPanel';
import { Button } from './components/ui/button';
import { Toaster } from './components/ui/sonner';
import { toast as _toast } from 'sonner';
import { apiGet, apiPost, WS_BASE_URL } from './lib/api';

type BackendSignal = {
  at: number;
  symbol: string;
  strategy: string;
  side: 'BUY' | 'SELL';
  entry: number;
  stop: number;
  target: number;
  status: 'ACTIVE' | 'CLOSED' | 'STOPPED';
  result?: 'WIN' | 'LOSS';
  pnl?: number | null;
};

type InstrumentsResponse = {
  symbols: string[];
  meta: Record<string, Record<string, unknown>>;
};

type StrategiesResponse = {
  catalog: { name: string; desc?: string }[];
};

type CandlesResponse = {
  s: string;
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
};

type SignalsResponse = {
  signals: BackendSignal[];
  count: number;
};

type PredictionResponse = {
  direction: 'BUY' | 'SELL' | 'NEUTRAL';
  confidence: number; // 0..1 or 0..100
  target?: number | null;
};

const toast: {
  (message: string, options?: any): void;
  success: (message: string, options?: any) => void;
  error: (message: string, options?: any) => void;
  info: (message: string, options?: any) => void;
} = _toast as any;

const STRATEGY_WIN_RATE_FALLBACK: Record<string, number> = {
  'RSI Crossover': 68,
  'MACD Divergence': 72,
  'Bollinger Bounce': 65,
  'EMA Crossover': 61,
  'Support/Resistance': 70,
};

const DEFAULT_STRATEGIES: Strategy[] = Object.entries(STRATEGY_WIN_RATE_FALLBACK).map(([name, winRate]) => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name,
  description: '',
  winRate,
  enabled: false,
}));

const FALLBACK_INSTRUMENT_DETAILS: Record<string, { label: string; name?: string }> = {
  EURUSD: { label: 'EUR/USD', name: 'Euro / US Dollar' },
  GBPUSD: { label: 'GBP/USD', name: 'British Pound / US Dollar' },
  USDJPY: { label: 'USD/JPY', name: 'US Dollar / Japanese Yen' },
  AUDUSD: { label: 'AUD/USD', name: 'Australian Dollar / US Dollar' },
  USDCAD: { label: 'USD/CAD', name: 'US Dollar / Canadian Dollar' },
  NZDUSD: { label: 'NZD/USD', name: 'New Zealand Dollar / US Dollar' },
  EURGBP: { label: 'EUR/GBP', name: 'Euro / British Pound' },
  EURJPY: { label: 'EUR/JPY', name: 'Euro / Japanese Yen' },
};

function formatSymbolLabel(symbol: string): string {
  if (FALLBACK_INSTRUMENT_DETAILS[symbol]?.label) {
    return FALLBACK_INSTRUMENT_DETAILS[symbol].label;
  }
  if (symbol.length === 6) {
    return `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
  }
  return symbol;
}

function mapSignal(signal: BackendSignal): SignalLog {
  const timestamp = signal.at * 1000;
  return {
    id: `${signal.symbol}-${signal.strategy}-${signal.at}`,
    symbol: signal.symbol,
    timestamp,
    time: new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    strategy: signal.strategy,
    side: signal.side,
    entry: signal.entry,
    stop: signal.stop,
    target: signal.target,
    status: signal.status,
    result: signal.result ?? undefined,
    pnl: signal.pnl ?? undefined,
  };
}

function buildPriceTargets(signals: SignalLog[]): PriceTarget[] {
  return signals
    .filter((signal) => signal.status === 'ACTIVE')
    .flatMap((signal) => [
      { id: `${signal.id}-entry`, price: signal.entry, type: 'entry' as const, strategy: signal.strategy },
      { id: `${signal.id}-stop`, price: signal.stop, type: 'stop' as const, strategy: signal.strategy },
      { id: `${signal.id}-target`, price: signal.target, type: 'target' as const, strategy: signal.strategy },
    ]);
}

const TIMEFRAME_OPTIONS = [
  { value: '1', label: 'M1' },
  { value: '5', label: 'M5' },
  { value: '15', label: 'M15' },
  { value: '30', label: 'M30' },
  { value: '60', label: 'H1' },
  { value: '240', label: 'H4' },
  { value: '1440', label: 'D1' },
];

// ---------- Sound system ----------
type SoundKey = 'signal' | 'prediction' | 'win' | 'loss' | 'connect' | 'disconnect';

const SOUND_URLS: Record<SoundKey, string> = {
  signal: '/sounds/signal.mp3',
  prediction: '/sounds/prediction.mp3',
  win: '/sounds/win.mp3',
  loss: '/sounds/loss.mp3',
  connect: '/sounds/connect.mp3',
  disconnect: '/sounds/disconnect.mp3',
};

function useSounds() {
  // Start as null; fill once in effect; use optional chaining everywhere.
  const soundsRef = useRef<Record<SoundKey, HTMLAudioElement | undefined> | null>(null);

  useEffect(() => {
    const obj: Record<SoundKey, HTMLAudioElement | undefined> = {
      signal: undefined,
      prediction: undefined,
      win: undefined,
      loss: undefined,
      connect: undefined,
      disconnect: undefined,
    };
    (Object.keys(SOUND_URLS) as SoundKey[]).forEach((key) => {
      const a = new Audio(SOUND_URLS[key]);
      a.preload = 'auto';
      a.volume = 0.6;
      obj[key] = a;
    });
    soundsRef.current = obj;

    return () => {
      (Object.keys(SOUND_URLS) as SoundKey[]).forEach((key) => {
        const a = soundsRef.current?.[key];
        if (a) a.pause();
        if (soundsRef.current) soundsRef.current[key] = undefined;
      });
    };
  }, []);

  const play = useCallback((key: SoundKey) => {
    const a = soundsRef.current?.[key];
    if (!a) return;
    try {
      a.currentTime = 0;
      void a.play();
    } catch {
      // ignore autoplay errors
    }
  }, []);

  return play;
}

export default function App() {
  const playSound = useSounds();

  const [instrumentOptions, setInstrumentOptions] = useState<InstrumentOption[]>([]);
  const [selectedInstrument, setSelectedInstrument] = useState<string>('EURUSD');

  const [timeframe, setTimeframe] = useState<string>('60');

  const [strategies, setStrategies] = useState<Strategy[]>(DEFAULT_STRATEGIES);
  const [isRunning, setIsRunning] = useState(false);
  const [isRunnerBusy, setIsRunnerBusy] = useState(false);
  const [runnerId, setRunnerId] = useState<string | null>(null);
  const runnerInstrumentRef = useRef<string | null>(null);

  const [candles, setCandles] = useState<Candle[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [signalLogs, setSignalLogs] = useState<SignalLog[]>([]);
  const [prediction, setPrediction] = useState<'BULLISH' | 'BEARISH' | 'NEUTRAL'>('NEUTRAL');
  const [confidence, setConfidence] = useState<number>(50);
  const [targetPrice, setTargetPrice] = useState<number | undefined>(undefined);
  const [isLoadingInstruments, setIsLoadingInstruments] = useState<boolean>(false);

  // Optional-chained map for status tracking sounds
  const lastSignalStatusRef = useRef<Map<string, { status: SignalLog['status']; result?: SignalLog['result'] }> | null>(null);

  // For smarter sound on prediction updates
  const lastPredictionRef = useRef<{ direction: string; target?: number | null } | null>(null);

  const toggleStrategy = useCallback((id: string) => {
    setStrategies((prevStrategies: Strategy[]) =>
      prevStrategies.map((strategy: Strategy) =>
        strategy.id === id ? { ...strategy, enabled: !strategy.enabled } : strategy
      )
    );
  }, []);

  // Instruments (merge API + fallback)
  useEffect(() => {
    let cancelled = false;

    const loadInstruments = async () => {
      setIsLoadingInstruments(true);
      try {
        const data = await apiGet<InstrumentsResponse>('/api/instruments');
        if (cancelled) return;

        const allSymbols = Array.from(
          new Set([
            ...Object.keys(FALLBACK_INSTRUMENT_DETAILS),
            ...(Array.isArray(data.symbols) ? data.symbols : []),
          ])
        );

        const options: InstrumentOption[] = allSymbols
          .map((symbol) => ({
            value: symbol,
            label: formatSymbolLabel(symbol),
            name: FALLBACK_INSTRUMENT_DETAILS[symbol]?.name,
          }))
          .sort((a, b) => a.label.localeCompare(b.label));

        setInstrumentOptions(options);
        setSelectedInstrument((prev) => {
          if (options.some((o) => o.value === prev)) return prev;
          return options[0]?.value ?? prev ?? 'EURUSD';
        });
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          toast.error('Failed to load instruments', { description: message });
          const fallbackOptions: InstrumentOption[] = Object.entries(FALLBACK_INSTRUMENT_DETAILS)
            .map(([value, meta]) => ({ value, label: meta.label, name: meta.name }))
            .sort((a, b) => a.label.localeCompare(b.label));
          setInstrumentOptions((prev) => (prev.length ? prev : fallbackOptions));
          setSelectedInstrument((prev) => {
            const options = fallbackOptions.length ? fallbackOptions : instrumentOptions;
            if (options.some((o) => o.value === prev)) return prev;
            return options[0]?.value ?? prev ?? 'EURUSD';
          });
        }
      } finally {
        if (!cancelled) setIsLoadingInstruments(false);
      }
    };

    loadInstruments();
    return () => {
      cancelled = true;
    };
  }, []);

  // Strategies
  useEffect(() => {
    let cancelled = false;

    const loadStrategies = async () => {
      try {
        const data = await apiGet<StrategiesResponse>('/api/strategies');
        if (cancelled) return;
        if (!data.catalog?.length) return;

        const mapped: Strategy[] = data.catalog.map(({ name, desc }) => ({
          id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          name,
          description: desc ?? '',
          winRate: STRATEGY_WIN_RATE_FALLBACK[name] ?? 60,
          enabled: false,
        }));
        setStrategies(mapped);
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          toast.error('Failed to load strategies', { description: message });
        }
      }
    };

    loadStrategies();
    return () => {
      cancelled = true;
    };
  }, []);

  // Market data (candles + WS ticks/bars)
  useEffect(() => {
    let cancelled = false;
    let barsWs: WebSocket | null = null;
    let ticksWs: WebSocket | null = null;

    if (!selectedInstrument) {
      return () => undefined;
    }

    const loadCandles = async () => {
      try {
        const params = new URLSearchParams({ symbol: selectedInstrument, timeframe, limit: '200' });
        const data = await apiGet<CandlesResponse>(`/api/candles?${params.toString()}`);
        if (cancelled) return;
        const mapped: Candle[] = data.t.map((timestamp, idx) => ({
          timestamp: timestamp * 1000,
          open: data.o[idx],
          high: data.h[idx],
          low: data.l[idx],
          close: data.c[idx],
        }));
        setCandles(mapped);
        if (mapped.length) {
          setCurrentPrice(mapped[mapped.length - 1].close);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          toast.error('Failed to load candles', { description: message });
          setCandles([]);
        }
      }
    };

    const connectBars = () => {
      const url = `${WS_BASE_URL}/ws/bars?symbol=${encodeURIComponent(selectedInstrument)}&res=${timeframe}`;
      barsWs = new WebSocket(url);
      barsWs.onopen = () => playSound('connect');
      barsWs.onclose = () => playSound('disconnect');
      barsWs.onerror = () => playSound('disconnect');
      barsWs.onmessage = (event) => {
        if (cancelled) return;
        try {
          const payload = JSON.parse(event.data);
          const bar = payload?.bar;
          if (!bar) return;
          const candle: Candle = {
            timestamp: bar.t * 1000,
            open: bar.o,
            high: bar.h,
            low: bar.l,
            close: bar.c,
          };
          setCandles((previousCandles: Candle[]) => {
            const idx = previousCandles.findIndex((item: Candle) => item.timestamp === candle.timestamp);
            if (idx >= 0) {
              const next = [...previousCandles];
              next[idx] = candle;
              return next;
            }
            return [...previousCandles.slice(-199), candle];
          });
          setCurrentPrice(candle.close);
        } catch (error) {
          console.error('Failed to parse bar payload', error);
        }
      };
    };

    const connectTicks = () => {
      const url = `${WS_BASE_URL}/ws/ticks?symbol=${encodeURIComponent(selectedInstrument)}`;
      ticksWs = new WebSocket(url);
      ticksWs.onopen = () => playSound('connect');
      ticksWs.onclose = () => playSound('disconnect');
      ticksWs.onerror = () => playSound('disconnect');
      ticksWs.onmessage = (event) => {
        if (cancelled) return;
        try {
          const payload = JSON.parse(event.data);
          const bid = Number(payload?.bid);
          const ask = Number(payload?.ask);
          if (Number.isFinite(bid) && Number.isFinite(ask)) {
            setCurrentPrice(Number(((bid + ask) / 2).toFixed(5)));
          }
        } catch (error) {
          console.error('Failed to parse tick payload', error);
        }
      };
    };

    loadCandles();
    connectBars();
    connectTicks();

    return () => {
      cancelled = true;
      barsWs?.close();
      ticksWs?.close();
    };
  }, [selectedInstrument, timeframe, playSound]);

  // Signal history + live (+ sounds)
  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;

    const loadSignals = async () => {
      try {
        const data = await apiGet<SignalsResponse>('/api/signals?limit=200');
        if (cancelled) return;
        const mapped = data.signals.map(mapSignal).sort((a, b) => b.timestamp - a.timestamp);
        setSignalLogs(mapped);
        const m = new Map<string, { status: SignalLog['status']; result?: SignalLog['result'] }>();
        for (const s of mapped) m.set(s.id, { status: s.status, result: s.result });
        lastSignalStatusRef.current = m;
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          toast.error('Failed to load signal history', { description: message });
        }
      }
    };

    const connectSignals = () => {
      ws = new WebSocket(`${WS_BASE_URL}/ws/signals`);
      ws.onopen = () => playSound('connect');
      ws.onclose = () => playSound('disconnect');
      ws.onerror = () => playSound('disconnect');
      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          const payload = JSON.parse(event.data) as BackendSignal;
          const mapped = mapSignal(payload);

          let isNewSignal = false;
          setSignalLogs((previousLogs: SignalLog[]) => {
            const idx = previousLogs.findIndex((signal: SignalLog) => signal.id === mapped.id);
            if (idx >= 0) {
              const next = [...previousLogs];
              next[idx] = mapped;
              return next;
            }
            isNewSignal = true;
            return [mapped, ...previousLogs].slice(0, 200);
          });

          if (isNewSignal) {
            playSound('signal');
          }

          const prev = lastSignalStatusRef.current?.get(mapped.id);
          lastSignalStatusRef.current?.set(mapped.id, { status: mapped.status, result: mapped.result });
          const resultToCheck = mapped.result ?? prev?.result;
          if (resultToCheck === 'WIN') playSound('win');
          else if (resultToCheck === 'LOSS') playSound('loss');

          if (isNewSignal && mapped.symbol === selectedInstrument) {
            toast.success(`New ${mapped.side} Signal`, {
              description: `${mapped.strategy} - Entry: ${mapped.entry.toFixed(5)}`,
            });
          }
        } catch (error) {
          console.error('Failed to parse signal payload', error);
        }
      };
    };

    loadSignals();
    connectSignals();

    return () => {
      cancelled = true;
      ws?.close();
    };
  }, [selectedInstrument, playSound]);

  // Prediction – instrument + timeframe (+ sound when direction/target change)
  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;

    if (!selectedInstrument) {
      return () => undefined;
    }

    const toUiDirection = (direction: 'BUY' | 'SELL' | 'NEUTRAL'): 'BULLISH' | 'BEARISH' | 'NEUTRAL' => {
      if (direction === 'BUY') return 'BULLISH';
      if (direction === 'SELL') return 'BEARISH';
      return 'NEUTRAL';
    };

    const applyPrediction = (payload: PredictionResponse | null) => {
      if (!payload) return;

      const raw = payload.confidence ?? 0;
      const pct = raw > 1 ? raw : raw * 100;

      const prev = lastPredictionRef.current;
      const changedDirection = prev?.direction !== payload.direction;
      const changedTarget = typeof payload.target === 'number' && payload.target !== (prev?.target ?? null);

      if (changedDirection || changedTarget) {
        playSound('prediction');
      }
      lastPredictionRef.current = { direction: payload.direction, target: payload.target };

      setPrediction(toUiDirection(payload.direction));
      setConfidence(Math.round(pct));

      // keep last target until a numeric comes in
      if (typeof payload.target === 'number') {
        setTargetPrice(payload.target);
      }
    };

    const loadPrediction = async () => {
      try {
        const params = new URLSearchParams({ symbol: selectedInstrument, tf: timeframe });
        const data = await apiGet<PredictionResponse>(`/api/prediction?${params.toString()}`);
        if (cancelled) return;
        applyPrediction(data);
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          toast.error('Failed to load prediction', { description: message });
        }
      }
    };

    const connectPrediction = () => {
      ws = new WebSocket(`${WS_BASE_URL}/ws/prediction?symbol=${encodeURIComponent(selectedInstrument)}&tf=${timeframe}`);
      ws.onopen = () => playSound('connect');
      ws.onclose = () => playSound('disconnect');
      ws.onerror = () => playSound('disconnect');
      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          const payload = JSON.parse(event.data) as PredictionResponse;
          applyPrediction(payload);
        } catch (error) {
          console.error('Failed to parse prediction payload', error);
        }
      };
    };

    loadPrediction();
    connectPrediction();

    return () => {
      cancelled = true;
      ws?.close();
    };
  }, [selectedInstrument, timeframe, playSound]);

  // Stop runner if instrument changed while running
  useEffect(() => {
    if (
      runnerInstrumentRef.current &&
      selectedInstrument &&
      runnerInstrumentRef.current !== selectedInstrument &&
      runnerId
    ) {
      (async () => {
        try {
          await apiPost('/api/strategies/stop', { id: runnerId });
        } catch (error) {
          console.error('Failed to stop runner on instrument change', error);
        } finally {
          runnerInstrumentRef.current = null;
          setRunnerId(null);
          setIsRunning(false);
          toast.info('Strategy runner stopped for instrument change', {
            description: 'Start again to run strategies on the new instrument.',
          });
        }
      })();
    }
  }, [runnerId, selectedInstrument]);

  const handleRunnerToggle = useCallback(async () => {
    if (!selectedInstrument) {
      toast.error('Select an instrument first');
      return;
    }
    if (isRunnerBusy) return;

    if (isRunning) {
      if (!runnerId) {
        setIsRunning(false);
        runnerInstrumentRef.current = null;
        return;
      }
      setIsRunnerBusy(true);
      try {
        await apiPost('/api/strategies/stop', { id: runnerId });
        setIsRunning(false);
        setRunnerId(null);
        runnerInstrumentRef.current = null;
        toast.info('Strategy runner stopped');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        toast.error('Failed to stop strategies', { description: message });
      } finally {
        setIsRunnerBusy(false);
      }
      return;
    }

    const activeStrategies = strategies
      .filter((strategy: Strategy) => strategy.enabled)
      .map((strategy: Strategy) => strategy.name);
    if (activeStrategies.length === 0) {
      toast.info('Enable at least one strategy to start the runner');
      return;
    }

    setIsRunnerBusy(true);
    try {
      const response = await apiPost<{ started?: boolean; running?: boolean; key?: string }>(
        '/api/strategies/start',
        {
          symbol: selectedInstrument,
          tf: timeframe,
          strategies: activeStrategies,
        }
      );
      if (response?.key) {
        setRunnerId(response.key);
        runnerInstrumentRef.current = selectedInstrument;
      }
      setIsRunning(true);
      toast.success('Strategy runner started', {
        description: `${selectedInstrument} • ${activeStrategies.length} strategies • TF ${TIMEFRAME_OPTIONS.find(t => t.value === timeframe)?.label ?? timeframe}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error('Failed to start strategies', { description: message });
    } finally {
      setIsRunnerBusy(false);
    }
  }, [isRunnerBusy, isRunning, runnerId, selectedInstrument, strategies, timeframe]);

  const instrumentSignals = useMemo(
    () => signalLogs.filter((signal: SignalLog) => signal.symbol === selectedInstrument),
    [signalLogs, selectedInstrument]
  );

  const priceTargets = useMemo<PriceTarget[]>(
    () => buildPriceTargets(instrumentSignals),
    [instrumentSignals]
  );

  const handleTfChange = (e: { target: HTMLSelectElement }) => {
    setTimeframe(e.target.value);
  };

  return (
    <div className="w-full min-h-screen bg-background">
      <Toaster />
      <div className="flex flex-col gap-4 p-4 max-w-[1800px] mx-auto w-full">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-8 h-8 text-primary" />
            <h1 className="text-foreground">Forex Strategy Runner</h1>
          </div>

          <div className="flex items-center gap-4">
            <InstrumentSelector
              value={selectedInstrument}
              onChange={setSelectedInstrument}
              instruments={instrumentOptions}
              disabled={isLoadingInstruments}
            />

            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">TF</label>
              <select
                className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                value={timeframe}
                onChange={handleTfChange}
              >
                {TIMEFRAME_OPTIONS.map((tf) => (
                  <option key={tf.value} value={tf.value}>{tf.label}</option>
                ))}
              </select>
            </div>

            <Button
              variant={isRunning ? 'destructive' : 'default'}
              onClick={handleRunnerToggle}
              className="gap-2"
              disabled={isRunnerBusy || instrumentOptions.length === 0}
            >
              {isRunning ? (
                <>
                  <PauseCircle className="w-4 h-4" />
                  {isRunnerBusy ? 'Stopping...' : 'Stop'}
                </>
              ) : (
                <>
                  <PlayCircle className="w-4 h-4" />
                  {isRunnerBusy ? 'Starting...' : 'Start'}
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-1">
            <StrategySelector strategies={strategies} onToggleStrategy={toggleStrategy} />
          </div>

        <div className="lg:col-span-3 flex flex-col gap-4">
            <div className="bg-card border border-border rounded-lg p-4 h-[500px]">
              <ForexChart
                instrument={selectedInstrument}
                candles={candles}
                currentPrice={currentPrice}
                priceTargets={priceTargets}
              />
            </div>

            <PredictionPanel
              prediction={prediction}
              confidence={confidence}
              targetPrice={targetPrice}
              timeframe={TIMEFRAME_OPTIONS.find(t => t.value === timeframe)?.label ?? 'H1'}
            />
          </div>
        </div>

        <div className="min-h-[350px]">
          <SignalLogs logs={signalLogs} />
        </div>
      </div>
    </div>
  );
}
