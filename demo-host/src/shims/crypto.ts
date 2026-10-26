// `@/lib/crypto` in the demo: no secrets exist, so "encryption" is plain JSON; tokens and hashes still behave.
import { createHash, digestBytes, randomBytes } from './node-crypto';

export const randomToken = (bytes = 24) => randomBytes(bytes).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function hmac(secretKey: string, body: string): string {
  const enc = new TextEncoder();
  let key: Uint8Array = enc.encode(secretKey);
  if (key.length > 64) key = digestBytes('sha256', key);
  const pad = (v: number) => {
    const b = new Uint8Array(64);
    b.set(key);
    return b.map((x) => x ^ v);
  };
  const join = (a: Uint8Array, b: Uint8Array) => {
    const o = new Uint8Array(a.length + b.length);
    o.set(a);
    o.set(b, a.length);
    return o;
  };
  const inner = digestBytes('sha256', join(pad(0x36), enc.encode(body)));
  return Array.from(digestBytes('sha256', join(pad(0x5c), inner)), (x) => x.toString(16).padStart(2, '0')).join('');
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function encryptJson(obj: unknown): string {
  return JSON.stringify(obj ?? null);
}

/** The seed stores credentials as plain objects (`{ demo: true }`); strings are parsed. */
export function decryptJson<T = any>(blob: unknown): T | null {
  if (blob == null) return null;
  if (typeof blob === 'object') return blob as T;
  try {
    return JSON.parse(String(blob)) as T;
  } catch {
    return null;
  }
}
