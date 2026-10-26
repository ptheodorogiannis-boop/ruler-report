// Simple, explainable anomaly detection: z-score of the latest day against the trailing window,
// with a floor so tiny series don't alarm.
export interface Anomaly {
  z: number;
  direction: 'spike' | 'drop';
  last: number;
  mean: number;
  pctVsMean: number;
}

export function detectAnomaly(values: number[], opts: { window?: number; threshold?: number } = {}): Anomaly | null {
  const window = opts.window ?? 14;
  const threshold = opts.threshold ?? 2.5;
  if (values.length < window + 1) return null;
  const last = values[values.length - 1];
  const hist = values.slice(-window - 1, -1);
  const mean = hist.reduce((a, b) => a + b, 0) / hist.length;
  const sd = Math.sqrt(hist.reduce((a, b) => a + (b - mean) ** 2, 0) / hist.length);
  if (mean < 5 || sd === 0) return null;
  const z = (last - mean) / sd;
  if (Math.abs(z) < threshold) return null;
  return { z: Math.round(z * 100) / 100, direction: z > 0 ? 'spike' : 'drop', last, mean: Math.round(mean * 100) / 100, pctVsMean: Math.round(((last - mean) / mean) * 1000) / 10 };
}
