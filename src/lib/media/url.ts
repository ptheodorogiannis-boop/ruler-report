// The one rule for image addresses the product accepts (spec §2–§3): one of our uploads, or an https URL that parses.
// Shared by the layout theme, the project logo action and the picker, so nothing unparseable reaches an <img src>.
export function isMediaOrHttps(v: string): boolean {
  if (v === '') return true;
  if (v.length > 500) return false;
  if (/^\/api\/media\/[a-z0-9]{1,64}$/i.test(v)) return true;
  if (!/^https:\/\//i.test(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && u.hostname.length > 0;
  } catch {
    return false;
  }
}
