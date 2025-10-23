import { useEffect, useRef, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts';
import { Badge } from './ui/badge';

interface PriceTarget {
  id: string;
  price: number;
  type: 'entry' | 'stop' | 'target';
  strategy: string;
}

interface ForexChartProps {
  instrument: string;
  priceTargets: PriceTarget[];
}

export function ForexChart({ instrument, priceTargets }: ForexChartProps) {
  const [chartData, setChartData] = useState<any[]>([]);
  const [currentPrice, setCurrentPrice] = useState(0);

  // Initialize chart with historical data
  useEffect(() => {
    const basePrice = instrument === 'EURUSD' ? 1.0850 : 
                      instrument === 'GBPUSD' ? 1.2650 :
                      instrument === 'USDJPY' ? 149.50 :
                      instrument === 'AUDUSD' ? 0.6550 : 1.0850;
    
    const data = [];
    const now = Date.now();
    
    for (let i = 100; i >= 0; i--) {
      const timestamp = now - (i * 60000); // 1 minute intervals
      const time = new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const variation = (Math.random() - 0.5) * 0.01;
      const price = basePrice + variation + (Math.sin(i / 10) * 0.005);
      
      data.push({
        time,
        timestamp,
        price: parseFloat(price.toFixed(5)),
      });
    }
    
    setChartData(data);
    setCurrentPrice(data[data.length - 1].price);
  }, [instrument]);

  // Simulate real-time price updates
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const time = new Date(now).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const lastPrice = chartData[chartData.length - 1]?.price || currentPrice;
      const variation = (Math.random() - 0.5) * 0.0005;
      const newPrice = parseFloat((lastPrice + variation).toFixed(5));
      
      setChartData(prev => {
        const updated = [...prev.slice(-100), { time, timestamp: now, price: newPrice }];
        return updated;
      });
      setCurrentPrice(newPrice);
    }, 2000);

    return () => clearInterval(interval);
  }, [chartData, currentPrice]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="text-muted-foreground">{payload[0].payload.time}</p>
          <p className="text-foreground">{payload[0].value.toFixed(5)}</p>
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
            <span className="text-foreground">{currentPrice.toFixed(5)}</span>
            <Badge variant={chartData.length > 1 && chartData[chartData.length - 1].price > chartData[chartData.length - 2].price ? 'default' : 'destructive'}>
              {chartData.length > 1 
                ? (chartData[chartData.length - 1].price - chartData[chartData.length - 2].price).toFixed(5)
                : '0.00000'}
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
            {priceTargets.map((target) => (
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
            {priceTargets.map((target) => (
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
