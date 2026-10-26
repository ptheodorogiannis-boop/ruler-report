// Client period picker (spec v3 §3.5): a dashboard carries the preset the agency chose plus, optionally, the presets
// the client may switch to from the public link. Anything outside that list falls back to the saved preset, so a
// crafted URL never widens what the client can query.
import { PRESET_LABEL, type Preset } from '@/lib/util/dates';

/** The rolling presets a client may be offered (never `custom`: a fixed range is not a rolling view). */
export const ROLLING_PRESETS: Preset[] = ['last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month', 'previous_month', 'this_quarter', 'year_to_date'];

type PresetSource = { preset: string | null; clientPresets: unknown };

const isRolling = (p: unknown): p is Preset => typeof p === 'string' && (ROLLING_PRESETS as string[]).includes(p);
const savedPreset = (r: PresetSource): Preset => (r.preset && (r.preset === 'custom' || isRolling(r.preset)) ? (r.preset as Preset) : 'custom');

/** The presets the public link offers, the saved one first; unknown names in `clientPresets` are dropped. */
export function allowedPresets(r: PresetSource): Preset[] {
  const saved = savedPreset(r);
  const extra = Array.isArray(r.clientPresets) ? r.clientPresets.filter(isRolling) : [];
  return [saved, ...extra.filter((p, i) => p !== saved && extra.indexOf(p) === i)];
}

/** The preset a request may use: `requested` only when the client is allowed to pick it, else the saved one. */
export function clientPreset(r: PresetSource, requested: string | null | undefined): Preset {
  const saved = savedPreset(r);
  if (!requested || requested === saved) return saved;
  return allowedPresets(r).includes(requested as Preset) ? (requested as Preset) : saved;
}

export const hasClientPresets = (r: PresetSource) => allowedPresets(r).length > 1;

export const presetLabel = (p: Preset) => PRESET_LABEL[p] ?? p;
