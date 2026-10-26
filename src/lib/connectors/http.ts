export class HttpError extends Error {
  constructor(public status: number, message: string, public body?: string) {
    super(message);
  }
}

export async function fetchJson<T = any>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 30000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) {
      let msg = text.slice(0, 280);
      try {
        const j = JSON.parse(text);
        msg = j?.error?.message || j?.error_description || j?.message || (typeof j?.error === 'string' ? j.error : msg);
      } catch {
        /* keep raw */
      }
      throw new HttpError(res.status, `HTTP ${res.status}: ${msg}`, text);
    }
    return (text ? JSON.parse(text) : {}) as T;
  } finally {
    clearTimeout(t);
  }
}

export async function fetchText(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 30000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status}: ${text.slice(0, 200)}`, text);
    return text;
  } finally {
    clearTimeout(t);
  }
}
