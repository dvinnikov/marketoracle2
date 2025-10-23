import { Checkbox } from './ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';

export interface Strategy {
  id: string;
  name: string;
  description: string;
  winRate: number;
  enabled: boolean;
}

interface StrategySelectorProps {
  strategies: Strategy[];
  onToggleStrategy: (id: string) => void;
}

export function StrategySelector({ strategies, onToggleStrategy }: StrategySelectorProps) {
  const activeCount = strategies.filter(s => s.enabled).length;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Trading Strategies</CardTitle>
        <CardDescription>
          Select strategies to run ({activeCount} active)
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        <ScrollArea className="h-full pr-4">
          <div className="space-y-3">
            {strategies.map((strategy) => (
              <div
                key={strategy.id}
                className="flex items-start space-x-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
                onClick={() => onToggleStrategy(strategy.id)}
              >
                <Checkbox
                  checked={strategy.enabled}
                  onCheckedChange={() => onToggleStrategy(strategy.id)}
                  className="mt-1"
                />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-foreground">{strategy.name}</p>
                    <Badge variant={strategy.winRate >= 60 ? 'default' : 'secondary'}>
                      {strategy.winRate}% WR
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-sm">{strategy.description}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
