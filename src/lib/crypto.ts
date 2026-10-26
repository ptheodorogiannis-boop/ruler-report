import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const secret = () => process.env.APP_SECRET || 'dev-insecure-secret-change-me-please-0000';
const key = () => createHash('sha256').update(secret()).digest();

export function encryptJson(obj: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
export function decryptJson<T = any>(blob: string | null | undefined): T | null {
  if (!blob) return null;
  try {
    const b = Buffer.from(blob, 'base64');
    const d = createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
  } catch {
    return null;
  }
}
export const randomToken = (bytes = 24) => randomBytes(bytes).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const hmac = (secretKey: string, body: string) => createHmac('sha256', secretKey).update(body).digest('hex');
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
