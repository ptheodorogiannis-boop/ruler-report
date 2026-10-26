// `@/lib/media/url` in the demo: the app's rule, plus images uploaded in the demo, which live in the browser as data URLs.
// demo uploads (png/jpeg/webp/gif) and the logos the capture embedded (svg included; an <img> never runs SVG scripts)
const DATA_IMAGE = /^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
export const DEMO_IMAGE_MAX_CHARS = 2_000_000;

export function isMediaOrHttps(v: string): boolean {
  if (v === '') return true;
  if (v.startsWith('data:')) return v.length <= DEMO_IMAGE_MAX_CHARS && DATA_IMAGE.test(v);
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
