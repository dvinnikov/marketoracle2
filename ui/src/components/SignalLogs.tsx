import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { ArrowUp, ArrowDown } from 'lucide-react';

export interface SignalLog {
  id: string;
  time: string;
  strategy: string;
  side: 'BUY' | 'SELL';
  entry: number;
  stop: number;
  target: number;
  status: 'ACTIVE' | 'CLOSED' | 'STOPPED';
  result?: 'WIN' | 'LOSS';
  pnl?: number;
}

interface SignalLogsProps {
  logs: SignalLog[];
}

export function SignalLogs({ logs }: SignalLogsProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'default';
      case 'CLOSED':
        return 'secondary';
      case 'STOPPED':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const getResultColor = (result?: string) => {
    if (result === 'WIN') return 'default';
    if (result === 'LOSS') return 'destructive';
    return 'secondary';
  };

  const totalPnl = logs.reduce((sum, log) => sum + (log.pnl || 0), 0);
  const winCount = logs.filter(log => log.result === 'WIN').length;
  const lossCount = logs.filter(log => log.result === 'LOSS').length;
  const winRate = logs.length > 0 ? ((winCount / (winCount + lossCount)) * 100).toFixed(1) : '0';

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Signal Logs</CardTitle>
        <CardDescription>
          <div className="flex items-center gap-4 mt-2">
            <span>Total P&L: <span className={totalPnl >= 0 ? 'text-green-500' : 'text-red-500'}>${totalPnl.toFixed(2)}</span></span>
            <span>Win Rate: {winRate}%</span>
            <span>Signals: {logs.length}</span>
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Strategy</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>Entry</TableHead>
                <TableHead>Stop</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Result</TableHead>
                <TableHead className="text-right">P&L</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    No signals yet. Select strategies and wait for signals...
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-muted-foreground">{log.time}</TableCell>
                    <TableCell>{log.strategy}</TableCell>
                    <TableCell>
                      <Badge variant={log.side === 'BUY' ? 'default' : 'destructive'} className="flex items-center gap-1 w-fit">
                        {log.side === 'BUY' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                        {log.side}
                      </Badge>
                    </TableCell>
                    <TableCell>{log.entry.toFixed(5)}</TableCell>
                    <TableCell>{log.stop.toFixed(5)}</TableCell>
                    <TableCell>{log.target.toFixed(5)}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusColor(log.status)}>
                        {log.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {log.result && (
                        <Badge variant={getResultColor(log.result)}>
                          {log.result}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className={`text-right ${log.pnl ? (log.pnl >= 0 ? 'text-green-500' : 'text-red-500') : ''}`}>
                      {log.pnl !== undefined ? `$${log.pnl.toFixed(2)}` : '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
