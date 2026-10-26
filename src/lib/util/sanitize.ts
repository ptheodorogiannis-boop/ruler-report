// Minimal allow-list HTML sanitizer for analysis cards (rendered on public client pages).
// Keeps basic text formatting and images from our uploads or https (spec §2); drops everything else (scripts, iframes,
// event handlers, javascript: URLs, inline styles).
import { isMediaOrHttps } from '@/lib/media/url';

const ALLOWED = new Set(['h2', 'h3', 'h4', 'p', 'br', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 'a', 'blockquote', 'code', 'hr', 'span', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img']);

const attr = (attrs: string, name: string): string | null => {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(attrs);
  return m ? (m[2] ?? m[3] ?? '').trim() : null;
};
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function sanitizeHtml(input: string): string {
  if (!input) return '';
  let s = input.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|iframe|object|embed|svg|math)[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (full, tag: string, attrs: string) => {
    const t = tag.toLowerCase();
    if (!ALLOWED.has(t)) return '';
    if (full.startsWith('</')) return t === 'img' ? '' : `</${t}>`;
    if (t === 'a') {
      const href = attr(attrs, 'href') ?? '';
      return /^(https?:|mailto:)/i.test(href) ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">` : '<a>';
    }
    if (t === 'img') {
      const src = attr(attrs, 'src') ?? '';
      if (!src || !isMediaOrHttps(src)) return '';
      const keep = ['alt', 'width', 'height']
        .map((n) => {
          const v = attr(attrs, n);
          return v == null ? '' : n === 'alt' ? ` alt="${esc(v)}"` : /^\d{1,5}$/.test(v) ? ` ${n}="${v}"` : '';
        })
        .join('');
      return `<img src="${esc(src)}"${keep}>`;
    }
    return `<${t}>`;
  });
  return s;
}

/** Plain text → safe paragraphs (used when a human types without HTML). */
export function textToHtml(text: string): string {
  if (/<\/?[a-z][\s\S]*>/i.test(text)) return sanitizeHtml(text);
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`)
    .join('');
}
