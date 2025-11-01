import catalog from '@shared/instruments/catalog.json';

export interface InstrumentOption {
  value: string;
  label: string;
  name?: string;
  category?: string;
}

interface InstrumentMeta {
  label: string;
  name?: string;
  category?: string;
}

interface RawInstrumentEntry {
  symbol?: string;
  label?: string;
  name?: string;
  category?: string;
}

const toDefaultLabel = (symbol: string): string => {
  if (symbol.length === 6) {
    return `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
  }
  return symbol;
};

const FALLBACK_ENTRIES: Array<Required<Pick<RawInstrumentEntry, 'symbol'>> & InstrumentMeta> =
  (Array.isArray(catalog) ? catalog : [])
    .map((entry) => ({
      symbol: entry?.symbol,
      label: entry?.label,
      name: entry?.name,
      category: entry?.category,
    }))
    .filter((entry): entry is Required<Pick<RawInstrumentEntry, 'symbol'>> & InstrumentMeta =>
      typeof entry.symbol === 'string' && entry.symbol.length > 0
    )
    .map((entry) => ({
      symbol: entry.symbol!,
      label: entry.label ?? toDefaultLabel(entry.symbol!),
      name: entry.name,
      category: entry.category,
    }));

export const FALLBACK_INSTRUMENT_DETAILS: Record<string, InstrumentMeta> = FALLBACK_ENTRIES.reduce(
  (acc, entry) => {
    acc[entry.symbol] = {
      label: entry.label,
      name: entry.name,
      category: entry.category,
    };
    return acc;
  },
  {} as Record<string, InstrumentMeta>
);

export const FALLBACK_INSTRUMENT_OPTIONS: InstrumentOption[] = FALLBACK_ENTRIES
  .map((entry) => ({
    value: entry.symbol,
    label: entry.label,
    name: entry.name,
    category: entry.category,
  }))
  .sort((a, b) => a.label.localeCompare(b.label));

export function formatSymbolLabel(symbol: string): string {
  const details = FALLBACK_INSTRUMENT_DETAILS[symbol];
  if (details?.label) {
    return details.label;
  }
  return toDefaultLabel(symbol);
}
