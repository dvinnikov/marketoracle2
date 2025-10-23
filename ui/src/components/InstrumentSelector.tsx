import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { TrendingUp } from 'lucide-react';

interface InstrumentSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

const instruments = [
  { value: 'EURUSD', label: 'EUR/USD', name: 'Euro / US Dollar' },
  { value: 'GBPUSD', label: 'GBP/USD', name: 'British Pound / US Dollar' },
  { value: 'USDJPY', label: 'USD/JPY', name: 'US Dollar / Japanese Yen' },
  { value: 'AUDUSD', label: 'AUD/USD', name: 'Australian Dollar / US Dollar' },
  { value: 'USDCAD', label: 'USD/CAD', name: 'US Dollar / Canadian Dollar' },
  { value: 'NZDUSD', label: 'NZD/USD', name: 'New Zealand Dollar / US Dollar' },
  { value: 'EURGBP', label: 'EUR/GBP', name: 'Euro / British Pound' },
  { value: 'EURJPY', label: 'EUR/JPY', name: 'Euro / Japanese Yen' },
];

export function InstrumentSelector({ value, onChange }: InstrumentSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <TrendingUp className="w-5 h-5 text-muted-foreground" />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[280px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {instruments.map((instrument) => (
            <SelectItem key={instrument.value} value={instrument.value}>
              <div className="flex flex-col items-start">
                <span>{instrument.label}</span>
                <span className="text-xs text-muted-foreground">{instrument.name}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
