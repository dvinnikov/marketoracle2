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

export const FALLBACK_INSTRUMENT_DETAILS: Record<string, InstrumentMeta> = {
  // Forex majors
  EURUSD: { label: 'EUR/USD', name: 'Euro / US Dollar', category: 'Forex' },
  GBPUSD: { label: 'GBP/USD', name: 'British Pound / US Dollar', category: 'Forex' },
  USDJPY: { label: 'USD/JPY', name: 'US Dollar / Japanese Yen', category: 'Forex' },
  USDCHF: { label: 'USD/CHF', name: 'US Dollar / Swiss Franc', category: 'Forex' },
  USDCAD: { label: 'USD/CAD', name: 'US Dollar / Canadian Dollar', category: 'Forex' },
  AUDUSD: { label: 'AUD/USD', name: 'Australian Dollar / US Dollar', category: 'Forex' },
  NZDUSD: { label: 'NZD/USD', name: 'New Zealand Dollar / US Dollar', category: 'Forex' },
  EURGBP: { label: 'EUR/GBP', name: 'Euro / British Pound', category: 'Forex' },
  EURJPY: { label: 'EUR/JPY', name: 'Euro / Japanese Yen', category: 'Forex' },
  GBPJPY: { label: 'GBP/JPY', name: 'British Pound / Japanese Yen', category: 'Forex' },
  AUDJPY: { label: 'AUD/JPY', name: 'Australian Dollar / Japanese Yen', category: 'Forex' },
  CADJPY: { label: 'CAD/JPY', name: 'Canadian Dollar / Japanese Yen', category: 'Forex' },
  CHFJPY: { label: 'CHF/JPY', name: 'Swiss Franc / Japanese Yen', category: 'Forex' },
  EURCHF: { label: 'EUR/CHF', name: 'Euro / Swiss Franc', category: 'Forex' },
  EURAUD: { label: 'EUR/AUD', name: 'Euro / Australian Dollar', category: 'Forex' },
  EURCAD: { label: 'EUR/CAD', name: 'Euro / Canadian Dollar', category: 'Forex' },
  GBPCAD: { label: 'GBP/CAD', name: 'British Pound / Canadian Dollar', category: 'Forex' },
  GBPAUD: { label: 'GBP/AUD', name: 'British Pound / Australian Dollar', category: 'Forex' },
  AUDNZD: { label: 'AUD/NZD', name: 'Australian Dollar / New Zealand Dollar', category: 'Forex' },
  NZDCAD: { label: 'NZD/CAD', name: 'New Zealand Dollar / Canadian Dollar', category: 'Forex' },
  USDSEK: { label: 'USD/SEK', name: 'US Dollar / Swedish Krona', category: 'Forex' },
  USDNOK: { label: 'USD/NOK', name: 'US Dollar / Norwegian Krone', category: 'Forex' },
  USDMXN: { label: 'USD/MXN', name: 'US Dollar / Mexican Peso', category: 'Forex' },
  USDTRY: { label: 'USD/TRY', name: 'US Dollar / Turkish Lira', category: 'Forex' },
  USDZAR: { label: 'USD/ZAR', name: 'US Dollar / South African Rand', category: 'Forex' },
  USDCNH: { label: 'USD/CNH', name: 'US Dollar / Chinese Yuan', category: 'Forex' },

  // Metals & Commodities
  XAUUSD: { label: 'XAU/USD', name: 'Gold / US Dollar', category: 'Metals' },
  XAGUSD: { label: 'XAG/USD', name: 'Silver / US Dollar', category: 'Metals' },
  XPTUSD: { label: 'XPT/USD', name: 'Platinum / US Dollar', category: 'Metals' },
  XPDUSD: { label: 'XPD/USD', name: 'Palladium / US Dollar', category: 'Metals' },
  XTIUSD: { label: 'XTI/USD', name: 'WTI Crude Oil / US Dollar', category: 'Energy' },
  XBRUSD: { label: 'XBR/USD', name: 'Brent Crude Oil / US Dollar', category: 'Energy' },
  USOIL: { label: 'USOIL', name: 'WTI Crude Oil', category: 'Energy' },
  UKOIL: { label: 'UKOIL', name: 'Brent Crude Oil', category: 'Energy' },
  NATGAS: { label: 'NATGAS', name: 'Natural Gas', category: 'Energy' },

  // Indices
  US30: { label: 'US30', name: 'Dow Jones 30', category: 'Indices' },
  SPX500: { label: 'SPX500', name: 'S&P 500', category: 'Indices' },
  NAS100: { label: 'NAS100', name: 'Nasdaq 100', category: 'Indices' },
  GER40: { label: 'GER40', name: 'DAX 40', category: 'Indices' },
  UK100: { label: 'UK100', name: 'FTSE 100', category: 'Indices' },
  FRA40: { label: 'FRA40', name: 'CAC 40', category: 'Indices' },
  ESP35: { label: 'ESP35', name: 'IBEX 35', category: 'Indices' },
  ITA40: { label: 'ITA40', name: 'FTSE MIB', category: 'Indices' },
  JP225: { label: 'JP225', name: 'Nikkei 225', category: 'Indices' },
  AUS200: { label: 'AUS200', name: 'ASX 200', category: 'Indices' },
  HK50: { label: 'HK50', name: 'Hang Seng 50', category: 'Indices' },
  CHINAH: { label: 'CHINAH', name: 'China H-Shares', category: 'Indices' },

  // Cryptocurrencies
  BTCUSD: { label: 'BTC/USD', name: 'Bitcoin / US Dollar', category: 'Crypto' },
  ETHUSD: { label: 'ETH/USD', name: 'Ethereum / US Dollar', category: 'Crypto' },
  LTCUSD: { label: 'LTC/USD', name: 'Litecoin / US Dollar', category: 'Crypto' },
  XRPUSD: { label: 'XRP/USD', name: 'Ripple / US Dollar', category: 'Crypto' },
  ADAUSD: { label: 'ADA/USD', name: 'Cardano / US Dollar', category: 'Crypto' },
  DOGEUSD: { label: 'DOGE/USD', name: 'Dogecoin / US Dollar', category: 'Crypto' },
  SOLUSD: { label: 'SOL/USD', name: 'Solana / US Dollar', category: 'Crypto' },
};

export const FALLBACK_INSTRUMENT_OPTIONS: InstrumentOption[] = Object.entries(
  FALLBACK_INSTRUMENT_DETAILS
).map(([value, meta]) => ({
  value,
  label: meta.label,
  name: meta.name,
  category: meta.category,
})).sort((a, b) => a.label.localeCompare(b.label));

export function formatSymbolLabel(symbol: string): string {
  const details = FALLBACK_INSTRUMENT_DETAILS[symbol];
  if (details?.label) {
    return details.label;
  }
  if (symbol.length === 6) {
    return `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
  }
  return symbol;
}
