import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface PredictionPanelProps {
  prediction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  targetPrice?: number;
  timeframe: string;
}

export function PredictionPanel({ prediction, confidence, targetPrice, timeframe }: PredictionPanelProps) {
  const getPredictionColor = () => {
    switch (prediction) {
      case 'BULLISH':
        return 'text-green-500';
      case 'BEARISH':
        return 'text-red-500';
      default:
        return 'text-muted-foreground';
    }
  };

  const getPredictionIcon = () => {
    switch (prediction) {
      case 'BULLISH':
        return <TrendingUp className="w-6 h-6" />;
      case 'BEARISH':
        return <TrendingDown className="w-6 h-6" />;
      default:
        return <Minus className="w-6 h-6" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Market Prediction</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={getPredictionColor()}>
                {getPredictionIcon()}
              </div>
              <div>
                <p className={`${getPredictionColor()}`}>{prediction}</p>
                <p className="text-muted-foreground text-sm">{timeframe}</p>
              </div>
            </div>
            <Badge variant={confidence >= 70 ? 'default' : 'secondary'}>
              {confidence}% Confidence
            </Badge>
          </div>
          
          {targetPrice && (
            <div className="pt-3 border-t border-border">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Target Price:</span>
                <span className="text-foreground">{targetPrice.toFixed(5)}</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
