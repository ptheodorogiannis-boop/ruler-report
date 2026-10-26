// Files the app hands the browser as <a download href="blob:…|data:…"> (a widget's CSV export, an image export). Claude
// pages ignore those links, so the demo passes the file to the page's `downloads` capability instead (review I1).
import { bus, type Locale } from './bus';
import { demoT } from './demo-strings';
import { saveFile } from './downloads';

const blobs = new Map<string, Blob>();

/** The file behind a blob: or data: link, or null when it is unknown. */
export function blobFor(href: string): Blob | null {
  if (/^blob:/i.test(href)) return blobs.get(href) ?? null;
  const m = href.match(/^data:([^,]*?)(;base64)?,([\s\S]*)$/i);
  if (!m) return null;
  const type = m[1] || 'text/plain';
  if (!m[2]) return new Blob([decodeURIComponent(m[3])], { type });
  const bin = atob(m[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export function isFileLink(a: HTMLAnchorElement): boolean {
  return a.hasAttribute('download') && /^(blob|data):/i.test(a.getAttribute('href') ?? '');
}

/** Read the file now (the app may revoke its blob URL right after the click), then offer it to the viewer. */
export function saveFileLink(a: HTMLAnchorElement, locale: Locale): void {
  const blob = blobFor(a.getAttribute('href') ?? '');
  if (!blob) return bus.toast(demoT(locale, 'downloadFailed'));
  void saveFile(a.getAttribute('download') || 'download', blob, locale);
}

/** Remember the blobs the app creates, and send programmatic clicks on file links to `saveFileLink`. */
export function installFileLinks(): void {
  const create = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (obj: Blob | MediaSource) => {
    const url = create(obj);
    if (obj instanceof Blob) blobs.set(url, obj);
    return url;
  };
  URL.revokeObjectURL = (url: string) => {
    blobs.delete(url);
    revoke(url);
  };
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (isFileLink(this)) return saveFileLink(this, bus.locale());
    return click.call(this);
  };
}
