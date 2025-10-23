import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

type UIDirection = "BULLISH" | "BEARISH" | "NEUTRAL";

export interface PredictionPanelProps {
  /** New-style props */
  prediction?: UIDirection;
  targetPrice?: number;
  timeframe?: string;

  /** Back-compat with callers passing these names */
  instrument?: string;          // optional display only
  direction?: UIDirection;      // alias of prediction
  target?: number;              // alias of targetPrice

  confidence: number;           // shared
}

export function PredictionPanel(props: PredictionPanelProps) {
  // Normalize props coming from either call site
  const direction: UIDirection = props.prediction ?? props.direction ?? "NEUTRAL";
  const target =
    typeof props.targetPrice === "number"
      ? props.targetPrice
      : typeof props.target === "number"
      ? props.target
      : undefined;

  // If timeframe not provided, show a friendly default
  const timeframeLabel = props.timeframe ?? "H1";

  const getPredictionColor = () => {
    switch (direction) {
      case "BULLISH":
        return "text-green-500";
      case "BEARISH":
        return "text-red-500";
      default:
        return "text-muted-foreground";
    }
  };

  const getPredictionIcon = () => {
    switch (direction) {
      case "BULLISH":
        return <TrendingUp className="w-6 h-6" />;
      case "BEARISH":
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
              <div className={getPredictionColor()}>{getPredictionIcon()}</div>
              <div>
                <p className={getPredictionColor()}>{direction}</p>
                <p className="text-muted-foreground text-sm">
                  {props.instrument ? `${props.instrument} • ` : ""}
                  {timeframeLabel}
                </p>
              </div>
            </div>
            <Badge variant={props.confidence >= 70 ? "default" : "secondary"}>
              {props.confidence}% Confidence
            </Badge>
          </div>

          {typeof target === "number" && (
            <div className="pt-3 border-t border-border">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Target Price:</span>
                <span className="text-foreground">{target.toFixed(5)}</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
