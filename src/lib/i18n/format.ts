// `{name}` interpolation shared by the server `t()` and the client `useT()`. Tiny and dependency-free on purpose: the
// client bundle must not pull the dictionaries in.
export type Vars = Record<string, string | number>;

export function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
