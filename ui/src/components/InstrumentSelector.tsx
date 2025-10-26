import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { TrendingUp } from 'lucide-react';
import { FALLBACK_INSTRUMENT_OPTIONS, InstrumentOption } from '../lib/instruments';

interface InstrumentSelectorProps {
  value: string;
  onChange: (value: string) => void;
  /** Accept both names to be compatible with callers */
  options?: InstrumentOption[];
  instruments?: InstrumentOption[];
  disabled?: boolean;
}

export function InstrumentSelector({
  value,
  onChange,
  options,
  instruments,
  disabled,
}: InstrumentSelectorProps) {
  const list = options ?? instruments ?? FALLBACK_INSTRUMENT_OPTIONS;
  const selected = list.find((i) => i.value === value);

  const renderMeta = (instrument: InstrumentOption) => {
    if (!instrument.name && !instrument.category) return null;
    const parts = [instrument.name, instrument.category].filter(Boolean);
    return <span className="text-xs text-muted-foreground">{parts.join(' • ')}</span>;
  };

  return (
    <div className="flex items-center gap-2">
      <TrendingUp className="w-5 h-5 text-muted-foreground" />
      <Select value={value} onValueChange={onChange} disabled={disabled || list.length === 0}>
        <SelectTrigger className="w-[300px]">
          <SelectValue placeholder="Select instrument">
            {selected ? (
              <span className="flex flex-col items-start">
                <span>{selected.label}</span>
                {renderMeta(selected)}
              </span>
            ) : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {list.map((instrument: InstrumentOption) => (
            <SelectItem key={instrument.value} value={instrument.value}>
              <div className="flex flex-col items-start">
                <span>{instrument.label}</span>
                {renderMeta(instrument)}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
