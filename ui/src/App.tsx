import { useState, useEffect, useCallback } from 'react';
import { ForexChart } from './components/ForexChart';
import { StrategySelector, Strategy } from './components/StrategySelector';
import { SignalLogs, SignalLog } from './components/SignalLogs';
import { InstrumentSelector } from './components/InstrumentSelector';
import { PredictionPanel } from './components/PredictionPanel';
import { Activity, PlayCircle, PauseCircle } from 'lucide-react';
import { Button } from './components/ui/button';
import { toast } from 'sonner@2.0.3';
import { Toaster } from './components/ui/sonner';

export default function App() {
  const [selectedInstrument, setSelectedInstrument] = useState('EURUSD');
  const [isRunning, setIsRunning] = useState(false);
  const [strategies, setStrategies] = useState<Strategy[]>([
    {
      id: 'rsi-crossover',
      name: 'RSI Crossover',
      description: 'Trades based on RSI crossing 30/70 levels with trend confirmation',
      winRate: 68,
      enabled: false,
    },
    {
      id: 'macd-divergence',
      name: 'MACD Divergence',
      description: 'Identifies divergences between price and MACD for reversal trades',
      winRate: 72,
      enabled: false,
    },
    {
      id: 'bollinger-bounce',
      name: 'Bollinger Bounce',
      description: 'Mean reversion strategy using Bollinger Band touches',
      winRate: 65,
      enabled: false,
    },
    {
      id: 'ema-crossover',
      name: 'EMA Crossover',
      description: 'Fast and slow EMA crossover with volume confirmation',
      winRate: 61,
      enabled: false,
    },
    {
      id: 'support-resistance',
      name: 'Support/Resistance',
      description: 'Trades bounces off key support and resistance levels',
      winRate: 70,
      enabled: false,
    },
    {
      id: 'breakout',
      name: 'Breakout Strategy',
      description: 'Captures momentum from range breakouts with volume spike',
      winRate: 58,
      enabled: false,
    },
    {
      id: 'fibonacci-retracement',
      name: 'Fibonacci Retracement',
      description: 'Enters at key Fibonacci levels during trend pullbacks',
      winRate: 64,
      enabled: false,
    },
    {
      id: 'price-action',
      name: 'Price Action',
      description: 'Candlestick patterns and chart formations',
      winRate: 69,
      enabled: false,
    },
  ]);
  
  const [signalLogs, setSignalLogs] = useState<SignalLog[]>([]);
  const [priceTargets, setPriceTargets] = useState<any[]>([]);
  const [prediction, setPrediction] = useState<'BULLISH' | 'BEARISH' | 'NEUTRAL'>('NEUTRAL');
  const [confidence, setConfidence] = useState(50);
  const [targetPrice, setTargetPrice] = useState<number>();

  const toggleStrategy = useCallback((id: string) => {
    setStrategies(prev => 
      prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s)
    );
  }, []);

  // Generate random signal
  const generateSignal = useCallback(() => {
    const enabledStrategies = strategies.filter(s => s.enabled);
    if (enabledStrategies.length === 0) return;

    const strategy = enabledStrategies[Math.floor(Math.random() * enabledStrategies.length)];
    const side: 'BUY' | 'SELL' = Math.random() > 0.5 ? 'BUY' : 'SELL';
    
    const basePrice = selectedInstrument === 'EURUSD' ? 1.0850 : 
                      selectedInstrument === 'GBPUSD' ? 1.2650 :
                      selectedInstrument === 'USDJPY' ? 149.50 :
                      selectedInstrument === 'AUDUSD' ? 0.6550 : 1.0850;
    
    const entry = basePrice + (Math.random() - 0.5) * 0.01;
    const stopDistance = 0.003;
    const targetDistance = 0.006;
    
    const stop = side === 'BUY' ? entry - stopDistance : entry + stopDistance;
    const target = side === 'BUY' ? entry + targetDistance : entry - targetDistance;

    const signal: SignalLog = {
      id: `signal-${Date.now()}-${Math.random()}`,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      strategy: strategy.name,
      side,
      entry: parseFloat(entry.toFixed(5)),
      stop: parseFloat(stop.toFixed(5)),
      target: parseFloat(target.toFixed(5)),
      status: 'ACTIVE',
    };

    setSignalLogs(prev => [signal, ...prev]);
    
    // Add price targets to chart
    setPriceTargets(prev => [
      ...prev,
      { id: `${signal.id}-entry`, price: signal.entry, type: 'entry', strategy: strategy.name },
      { id: `${signal.id}-stop`, price: signal.stop, type: 'stop', strategy: strategy.name },
      { id: `${signal.id}-target`, price: signal.target, type: 'target', strategy: strategy.name },
    ]);

    // Show toast notification
    toast.success(`New ${side} Signal`, {
      description: `${strategy.name} - Entry: ${signal.entry.toFixed(5)}`,
    });

    // Simulate signal resolution after some time
    setTimeout(() => {
      const isWin = Math.random() < (strategy.winRate / 100);
      const pnl = isWin ? Math.random() * 50 + 10 : -(Math.random() * 30 + 5);
      
      setSignalLogs(prev => 
        prev.map(s => 
          s.id === signal.id 
            ? { ...s, status: isWin ? 'CLOSED' : 'STOPPED', result: isWin ? 'WIN' : 'LOSS', pnl: parseFloat(pnl.toFixed(2)) }
            : s
        )
      );

      // Remove price targets after resolution
      setTimeout(() => {
        setPriceTargets(prev => prev.filter(pt => !pt.id.startsWith(signal.id)));
      }, 5000);
    }, Math.random() * 20000 + 10000);

  }, [strategies, selectedInstrument]);

  // Update prediction
  useEffect(() => {
    const updatePrediction = () => {
      const predictions: ('BULLISH' | 'BEARISH' | 'NEUTRAL')[] = ['BULLISH', 'BEARISH', 'NEUTRAL'];
      const newPrediction = predictions[Math.floor(Math.random() * predictions.length)];
      const newConfidence = Math.floor(Math.random() * 30) + 55;
      
      const basePrice = selectedInstrument === 'EURUSD' ? 1.0850 : 
                        selectedInstrument === 'GBPUSD' ? 1.2650 :
                        selectedInstrument === 'USDJPY' ? 149.50 :
                        selectedInstrument === 'AUDUSD' ? 0.6550 : 1.0850;
      
      const targetVariation = (Math.random() - 0.5) * 0.02;
      const newTargetPrice = basePrice + targetVariation;
      
      setPrediction(newPrediction);
      setConfidence(newConfidence);
      setTargetPrice(newTargetPrice);
    };

    updatePrediction();
    const interval = setInterval(updatePrediction, 30000);
    return () => clearInterval(interval);
  }, [selectedInstrument]);

  // Signal generation loop
  useEffect(() => {
    if (!isRunning) return;

    const enabledCount = strategies.filter(s => s.enabled).length;
    if (enabledCount === 0) return;

    const interval = setInterval(() => {
      if (Math.random() > 0.6) { // 40% chance to generate signal
        generateSignal();
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [isRunning, strategies, generateSignal]);

  return (
    <div className="w-full min-h-screen bg-background">
      <Toaster />
      <div className="flex flex-col gap-4 p-4 max-w-[1800px] mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-8 h-8 text-primary" />
            <h1 className="text-foreground">Forex Strategy Runner</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <InstrumentSelector 
              value={selectedInstrument} 
              onChange={setSelectedInstrument}
            />
            
            <Button
              variant={isRunning ? 'destructive' : 'default'}
              onClick={() => {
                setIsRunning(!isRunning);
                toast.info(isRunning ? 'Strategy runner stopped' : 'Strategy runner started');
              }}
              className="gap-2"
            >
              {isRunning ? (
                <>
                  <PauseCircle className="w-4 h-4" />
                  Stop
                </>
              ) : (
                <>
                  <PlayCircle className="w-4 h-4" />
                  Start
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Left Panel - Strategies */}
          <div className="lg:col-span-1">
            <StrategySelector 
              strategies={strategies}
              onToggleStrategy={toggleStrategy}
            />
          </div>

          {/* Center Panel - Chart and Prediction */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            <div className="bg-card border border-border rounded-lg p-4 h-[500px]">
              <ForexChart 
                instrument={selectedInstrument}
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

        {/* Signal Logs */}
        <div className="min-h-[350px]">
          <SignalLogs logs={signalLogs} />
        </div>
      </div>
    </div>
  );
}
