import type { Format } from '@/lib/engine/types';

export interface FormatOpts {
  currency?: string;
  decimalSeparatorFormat?: string; // comma_dot (1,234.56) | dot_comma (1.234,56)
}

function group(n: string, sep: string) {
  return n.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}
export function fmtNumber(v: number, decimals = 0, o: FormatOpts = {}) {
  const dotComma = o.decimalSeparatorFormat === 'dot_comma';
  const [i, f] = Math.abs(v).toFixed(decimals).split('.');
  const body = group(i, dotComma ? '.' : ',') + (f ? (dotComma ? ',' : '.') + f : '');
  return (v < 0 ? '-' : '') + body;
}
const SYMBOL: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', BRL: 'R$', CAD: 'CA$', AUD: 'A$', CHF: 'CHF ', JPY: '¥', TRY: '₺', PLN: 'zł ' };
export function formatValue(v: number | null | undefined, format: Format, o: FormatOpts = {}): string {
  if (v == null || Number.isNaN(v)) return '—';
  switch (format) {
    case 'currency': {
      const sym = SYMBOL[o.currency ?? 'EUR'] ?? `${o.currency} `;
      return sym + fmtNumber(v, Math.abs(v) >= 1000 ? 0 : 2, o);
    }
    case 'percent':
      return fmtNumber(v, Math.abs(v) >= 100 ? 0 : 2, o) + '%';
    case 'decimal':
      return fmtNumber(v, 2, o);
    case 'duration': {
      const s = Math.round(v);
      const m = Math.floor(s / 60);
      return m > 0 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
    }
    case 'text':
      return String(v);
    default:
      return fmtNumber(v, Math.abs(v) >= 1000 || Number.isInteger(v) ? 0 : 2, o);
  }
}
export function compact(v: number) {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(Math.round(v * 100) / 100);
}
