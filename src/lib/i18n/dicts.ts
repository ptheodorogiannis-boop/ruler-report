// The two dictionaries (spec v3 §5): flat, namespaced keys (`area.item`), `{name}` interpolation. JSON so the check and
// review scripts read them with plain node; this module gives them a type. Server-side only — client components get
// the namespaces they need through `I18nProvider`.
import enJson from './en.json';
import elJson from './el.json';

export type Dictionary = Record<string, string>;
export const en: Dictionary = enJson;
export const el: Dictionary = elJson;
