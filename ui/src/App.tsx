import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, PauseCircle, PlayCircle } from 'lucide-react';
import { ForexChart, Candle, PriceTarget } from './components/ForexChart';
import { StrategySelector, Strategy } from './components/StrategySelector';
import { SignalLogs, SignalLog } from './components/SignalLogs';
import { InstrumentSelector, InstrumentOption } from './components/InstrumentSelector';
import { PredictionPanel } from './components/PredictionPanel';
import { Button } from './components/ui/button';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
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
  confidence: number;
  target?: number | null;
};

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

const TIMEFRAME = '60';

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

export default function App() {
  const [instrumentOptions, setInstrumentOptions] = useState<InstrumentOption[]>([]);
  const [selectedInstrument, setSelectedInstrument] = useState<string>('EURUSD');
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

  const toggleStrategy = useCallback((id: string) => {
    setStrategies((prevStrategies: Strategy[]) =>
      prevStrategies.map((strategy: Strategy) =>
        strategy.id === id ? { ...strategy, enabled: !strategy.enabled } : strategy
      )
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadInstruments = async () => {
      setIsLoadingInstruments(true);
      try {
        const data = await apiGet<InstrumentsResponse>('/api/instruments');
        if (cancelled) return;
        const options: InstrumentOption[] = data.symbols.map((symbol) => ({
          value: symbol,
          label: formatSymbolLabel(symbol),
          name: FALLBACK_INSTRUMENT_DETAILS[symbol]?.name,
        }));
        setInstrumentOptions(options);
        setSelectedInstrument((previousInstrument: string) => {
          if (options.some((option: InstrumentOption) => option.value === previousInstrument)) {
            return previousInstrument;
          }
          return options[0]?.value ?? previousInstrument ?? 'EURUSD';
        });
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          toast.error('Failed to load instruments', { description: message });
          const fallbackOptions: InstrumentOption[] = Object.entries(FALLBACK_INSTRUMENT_DETAILS).map(([value, meta]) => ({
            value,
            label: meta.label,
            name: meta.name,
          }));
          setInstrumentOptions((previousOptions: InstrumentOption[]) =>
            previousOptions.length ? previousOptions : fallbackOptions
          );
          setSelectedInstrument((previousInstrument: string) => {
            const options = fallbackOptions.length ? fallbackOptions : instrumentOptions;
            if (options.some((option: InstrumentOption) => option.value === previousInstrument)) {
              return previousInstrument;
            }
            return options[0]?.value ?? previousInstrument ?? 'EURUSD';
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoadingInstruments(false);
        }
      }
    };

    loadInstruments();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadStrategies = async () => {
      try {
        const data = await apiGet<StrategiesResponse>('/api/strategies');
        if (cancelled) return;
        if (!data.catalog?.length) {
          return;
        }
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

  useEffect(() => {
    let cancelled = false;
    let barsWs: WebSocket | null = null;
    let ticksWs: WebSocket | null = null;

    if (!selectedInstrument) {
      return () => undefined;
    }

    const loadCandles = async () => {
      try {
        const params = new URLSearchParams({ symbol: selectedInstrument, timeframe: TIMEFRAME, limit: '200' });
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
      const url = `${WS_BASE_URL}/ws/bars?symbol=${encodeURIComponent(selectedInstrument)}&res=${TIMEFRAME}`;
      barsWs = new WebSocket(url);
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
      barsWs.onerror = (event) => {
        console.error('Bars websocket error', event);
      };
    };

    const connectTicks = () => {
      const url = `${WS_BASE_URL}/ws/ticks?symbol=${encodeURIComponent(selectedInstrument)}`;
      ticksWs = new WebSocket(url);
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
      ticksWs.onerror = (event) => {
        console.error('Ticks websocket error', event);
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
  }, [selectedInstrument]);

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;

    const loadSignals = async () => {
      try {
        const data = await apiGet<SignalsResponse>('/api/signals?limit=200');
        if (cancelled) return;
        const mapped = data.signals.map(mapSignal).sort((a, b) => b.timestamp - a.timestamp);
        setSignalLogs(mapped);
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          toast.error('Failed to load signal history', { description: message });
        }
      }
    };

    const connectSignals = () => {
      ws = new WebSocket(`${WS_BASE_URL}/ws/signals`);
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
          if (isNewSignal && mapped.symbol === selectedInstrument) {
            toast.success(`New ${mapped.side} Signal`, {
              description: `${mapped.strategy} - Entry: ${mapped.entry.toFixed(5)}`,
            });
          }
        } catch (error) {
          console.error('Failed to parse signal payload', error);
        }
      };
      ws.onerror = (event) => {
        console.error('Signals websocket error', event);
      };
    };

    loadSignals();
    connectSignals();

    return () => {
      cancelled = true;
      ws?.close();
    };
  }, [selectedInstrument]);

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
      setPrediction(toUiDirection(payload.direction));
      setConfidence(Math.round((payload.confidence ?? 0) * 100));
      setTargetPrice(typeof payload.target === 'number' ? payload.target : undefined);
    };

    const loadPrediction = async () => {
      try {
        const params = new URLSearchParams({ symbol: selectedInstrument, tf: TIMEFRAME });
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
      ws = new WebSocket(`${WS_BASE_URL}/ws/prediction?symbol=${encodeURIComponent(selectedInstrument)}&tf=${TIMEFRAME}`);
      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          const payload = JSON.parse(event.data) as PredictionResponse;
          applyPrediction(payload);
        } catch (error) {
          console.error('Failed to parse prediction payload', error);
        }
      };
      ws.onerror = (event) => {
        console.error('Prediction websocket error', event);
      };
    };

    loadPrediction();
    connectPrediction();

    return () => {
      cancelled = true;
      ws?.close();
    };
  }, [selectedInstrument]);

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

    if (isRunnerBusy) {
      return;
    }

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
          tf: TIMEFRAME,
          strategies: activeStrategies,
        }
      );
      if (response?.key) {
        setRunnerId(response.key);
        runnerInstrumentRef.current = selectedInstrument;
      }
      setIsRunning(true);
      toast.success('Strategy runner started', {
        description: `${selectedInstrument} • ${activeStrategies.length} strategies`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error('Failed to start strategies', { description: message });
    } finally {
      setIsRunnerBusy(false);
    }
  }, [isRunnerBusy, isRunning, runnerId, selectedInstrument, strategies]);

  const instrumentSignals = useMemo(
    () => signalLogs.filter((signal: SignalLog) => signal.symbol === selectedInstrument),
    [signalLogs, selectedInstrument]
  );

  const priceTargets = useMemo<PriceTarget[]>(
    () => buildPriceTargets(instrumentSignals),
    [instrumentSignals]
  );

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
              timeframe="Next 1-4 hours"
            />
          </div>
        </div>

        <div className="min-h-[350px]">
          <SignalLogs logs={instrumentSignals} />
        </div>
      </div>
    </div>
  );
}

