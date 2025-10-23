import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { TrendingUp } from 'lucide-react';

export interface InstrumentOption {
  value: string;
  label: string;
  name?: string;
}

interface InstrumentSelectorProps {
  value: string;
  onChange: (value: string) => void;
  instruments?: InstrumentOption[];
  disabled?: boolean;
}

const FALLBACK_INSTRUMENTS: InstrumentOption[] = [
  { value: 'EURUSD', label: 'EUR/USD', name: 'Euro / US Dollar' },
  { value: 'GBPUSD', label: 'GBP/USD', name: 'British Pound / US Dollar' },
  { value: 'USDJPY', label: 'USD/JPY', name: 'US Dollar / Japanese Yen' },
  { value: 'AUDUSD', label: 'AUD/USD', name: 'Australian Dollar / US Dollar' },
  { value: 'USDCAD', label: 'USD/CAD', name: 'US Dollar / Canadian Dollar' },
  { value: 'NZDUSD', label: 'NZD/USD', name: 'New Zealand Dollar / US Dollar' },
  { value: 'EURGBP', label: 'EUR/GBP', name: 'Euro / British Pound' },
  { value: 'EURJPY', label: 'EUR/JPY', name: 'Euro / Japanese Yen' },
];

export function InstrumentSelector({ value, onChange, instruments = FALLBACK_INSTRUMENTS, disabled }: InstrumentSelectorProps) {
  const options = instruments.length > 0 ? instruments : FALLBACK_INSTRUMENTS;

  return (
    <div className="flex items-center gap-2">
      <TrendingUp className="w-5 h-5 text-muted-foreground" />
      <Select value={value} onValueChange={onChange} disabled={disabled || options.length === 0}>
        <SelectTrigger className="w-[280px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((instrument: InstrumentOption) => (
            <SelectItem key={instrument.value} value={instrument.value}>
              <div className="flex flex-col items-start">
                <span>{instrument.label}</span>
                {instrument.name && (
                  <span className="text-xs text-muted-foreground">{instrument.name}</span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
