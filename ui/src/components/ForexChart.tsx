import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { TooltipProps } from 'recharts';
import { Badge } from './ui/badge';

export interface PriceTarget {
  id: string;
  price: number;
  type: 'entry' | 'stop' | 'target';
  strategy: string;
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface ForexChartProps {
  instrument: string;
  candles: Candle[];
  currentPrice?: number;
  priceTargets: PriceTarget[];
}

export function ForexChart({ instrument, candles, currentPrice, priceTargets }: ForexChartProps) {
  const chartData = useMemo(() => (
    candles.map((candle: Candle) => ({
      time: new Date(candle.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      price: candle.close,
      timestamp: candle.timestamp,
    }))
  ), [candles]);

  const lastPrice = currentPrice ?? chartData[chartData.length - 1]?.price ?? 0;
  const prevPrice = chartData.length > 1 ? chartData[chartData.length - 2].price : lastPrice;

  const CustomTooltip = ({ active, payload }: TooltipProps<number, string>): JSX.Element | null => {
    if (active && payload && payload.length) {
      const first = payload[0];
      const value = typeof first.value === 'number' ? first.value : Number(first.value ?? 0);
      if (!Number.isFinite(value)) {
        return null;
      }
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="text-muted-foreground">{String(first.payload?.time ?? '')}</p>
          <p className="text-foreground">{value.toFixed(5)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex items-center justify-between mb-4 px-4">
        <div className="flex items-center gap-4">
          <h2 className="text-foreground">{instrument}</h2>
          <div className="flex items-center gap-2">
            <span className="text-foreground">{lastPrice.toFixed(5)}</span>
            <Badge variant={lastPrice >= prevPrice ? 'default' : 'destructive'}>
              {(lastPrice - prevPrice).toFixed(5)}
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex-1 relative">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="time"
              stroke="var(--muted-foreground)"
              tick={{ fontSize: 12 }}
              interval="preserveStartEnd"
            />
            <YAxis 
              domain={['auto', 'auto']}
              stroke="var(--muted-foreground)"
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => value.toFixed(5)}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="price"
              stroke="hsl(var(--chart-1))"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />

            {/* Price targets */}
            {priceTargets.map((target: PriceTarget) => (
              <ReferenceLine
                key={target.id}
                y={target.price}
                stroke={
                  target.type === 'entry' ? 'hsl(var(--chart-2))' :
                  target.type === 'stop' ? 'hsl(var(--destructive))' :
                  'hsl(var(--chart-4))'
                }
                strokeDasharray="5 5"
                strokeWidth={2}
                label={{
                  value: `${target.type.toUpperCase()}: ${target.price.toFixed(5)}`,
                  position: 'right',
                  fill: 'var(--foreground)',
                  fontSize: 11,
                }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>

        {/* Price target legend */}
        {priceTargets.length > 0 && (
          <div className="absolute top-2 right-2 bg-card/90 backdrop-blur border border-border rounded-lg p-2 space-y-1">
            {priceTargets.map((target: PriceTarget) => (
              <div key={target.id} className="flex items-center gap-2 text-xs">
                <div 
                  className="w-3 h-3 rounded-sm" 
                  style={{
                    backgroundColor: target.type === 'entry' ? 'hsl(var(--chart-2))' :
                                   target.type === 'stop' ? 'hsl(var(--destructive))' :
                                   'hsl(var(--chart-4))'
                  }}
                />
                <span className="text-muted-foreground">{target.strategy} - {target.type}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
