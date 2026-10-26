// `node:crypto` in the browser build: the hashes the app's bundled modules use (cache keys, scope hashes). Pure JS,
// synchronous like node's, UTF-8 input.
const enc = new TextEncoder();

function rotl(x: number, n: number) {
  return (x << n) | (x >>> (32 - n));
}
function rotr(x: number, n: number) {
  return (x >>> n) | (x << (32 - n));
}

/** Pad a message the Merkle–Damgård way; returns 32-bit big-endian words. */
function words(bytes: Uint8Array): Uint32Array {
  const len = bytes.length;
  const total = (((len + 8) >> 6) + 1) * 16;
  const w = new Uint32Array(total);
  for (let i = 0; i < len; i++) w[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
  w[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
  const bits = len * 8;
  w[total - 1] = bits >>> 0;
  w[total - 2] = Math.floor(bits / 0x100000000);
  return w;
}

function sha1(bytes: Uint8Array): Uint32Array {
  const w = words(bytes);
  let [a0, b0, c0, d0, e0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const x = new Uint32Array(80);
  for (let i = 0; i < w.length; i += 16) {
    for (let t = 0; t < 16; t++) x[t] = w[i + t];
    for (let t = 16; t < 80; t++) x[t] = rotl(x[t - 3] ^ x[t - 8] ^ x[t - 14] ^ x[t - 16], 1);
    let [a, b, c, d, e] = [a0, b0, c0, d0, e0];
    for (let t = 0; t < 80; t++) {
      const f = t < 20 ? (b & c) | (~b & d) : t < 40 ? b ^ c ^ d : t < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
      const k = t < 20 ? 0x5a827999 : t < 40 ? 0x6ed9eba1 : t < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const tmp = (rotl(a, 5) + f + e + k + x[t]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30) >>> 0;
      b = a;
      a = tmp;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
    e0 = (e0 + e) >>> 0;
  }
  return Uint32Array.from([a0, b0, c0, d0, e0]);
}

const K256 = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256(bytes: Uint8Array): Uint32Array {
  const w = words(bytes);
  const h = Uint32Array.from([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const x = new Uint32Array(64);
  for (let i = 0; i < w.length; i += 16) {
    for (let t = 0; t < 16; t++) x[t] = w[i + t];
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(x[t - 15], 7) ^ rotr(x[t - 15], 18) ^ (x[t - 15] >>> 3);
      const s1 = rotr(x[t - 2], 17) ^ rotr(x[t - 2], 19) ^ (x[t - 2] >>> 10);
      x[t] = (x[t - 16] + s0 + x[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K256[t] + x[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }
  return h;
}

const toBytes = (w: Uint32Array) => {
  const out = new Uint8Array(w.length * 4);
  w.forEach((v, i) => {
    out[i * 4] = v >>> 24;
    out[i * 4 + 1] = (v >>> 16) & 255;
    out[i * 4 + 2] = (v >>> 8) & 255;
    out[i * 4 + 3] = v & 255;
  });
  return out;
};
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

export function digestBytes(alg: string, data: Uint8Array): Uint8Array {
  if (alg === 'sha1') return toBytes(sha1(data));
  if (alg === 'sha256') return toBytes(sha256(data));
  throw new Error(`Hash ${alg} is not available in the demo`);
}

export function createHash(alg: string) {
  const parts: Uint8Array[] = [];
  const api = {
    update(s: string | Uint8Array) {
      parts.push(typeof s === 'string' ? enc.encode(s) : s);
      return api;
    },
    digest(encoding?: 'hex' | 'base64') {
      const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      let o = 0;
      for (const p of parts) {
        all.set(p, o);
        o += p.length;
      }
      const d = digestBytes(alg, all);
      return encoding === 'base64' ? b64(d) : hex(d);
    },
  };
  return api;
}

export function randomBytes(n: number) {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return {
    bytes: b,
    toString(encoding: 'hex' | 'base64' | 'base64url' = 'hex') {
      if (encoding === 'hex') return hex(b);
      const s = b64(b);
      return encoding === 'base64' ? s : s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
  };
}
