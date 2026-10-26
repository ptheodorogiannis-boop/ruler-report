// Tones of a per-block analysis (spec v3 §4.4). Browser-safe: the editor menu and the server share this list.
export const TONES = ['general', 'performance', 'worst', 'opportunities', 'executive'] as const;
export type Tone = (typeof TONES)[number];
export const TONE_LABEL: Record<Tone, string> = {
  general: 'General',
  performance: 'Performance',
  worst: 'What went worst',
  opportunities: 'Opportunities',
  executive: 'Executive summary',
};
export const isTone = (s: unknown): s is Tone => typeof s === 'string' && (TONES as readonly string[]).includes(s);
