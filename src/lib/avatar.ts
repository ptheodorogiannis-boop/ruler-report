// Procedural avatars derived from a seed (a user's email): one base character (bible-strong avatar lab,
// src/data/base.avatar.json) whose body colour, shape and proportions are chosen by a hash of the seed, so every
// user gets a face that is theirs without uploading anything. Pure: runs on the server and in the browser.
import base from '@/data/base.avatar.json';
import type { AvatarDefinition, HexColor, SurfaceDefinition } from '@bible-strong/avatar-core';

/** Eight body colours that read apart from the UI accent and from each other (docs/DESIGN.md › Award pass). */
export const AVATAR_COLORS: HexColor[] = ['#1a36e6', '#0e9f8e', '#d97a1d', '#7c5ce6', '#c2362b', '#557086', '#11784a', '#b35c9e'];
const SURFACES = ['sphere', 'capsule', 'cube', 'cylinder', 'diamond', 'sphere', 'capsule', 'cone'] as const;
const EYES: HexColor = '#101418';

/** FNV-1a 32-bit: small, stable across runtimes. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export const normalizeSeed = (seed: string) => seed.trim().toLowerCase() || 'ruler-reports';

/** The traits a seed maps to (exported so the UI can describe or test them). */
export function avatarTraits(seed: string) {
  const h = hashSeed(normalizeSeed(seed));
  const pick = (n: number, shift: number) => ((h >>> shift) & 0xff) % n;
  const surface = SURFACES[pick(SURFACES.length, 3)];
  const roundness = surface === 'sphere' ? 1 : surface === 'capsule' ? 1 : [0.15, 0.35, 0.6, 0.85][pick(4, 8)];
  const wscale = [0.9, 0.96, 1, 1.06, 1.12][pick(5, 12)];
  const hscale = [0.9, 0.96, 1, 1.06, 1.12][pick(5, 16)];
  return { color: AVATAR_COLORS[pick(AVATAR_COLORS.length, 0)], surface, roundness, wscale, hscale, hash: h };
}

/** A complete, valid definition for the seed. The reference is stable per call site when memoised on the seed. */
export function avatarFor(seed: string): AvatarDefinition {
  const t = avatarTraits(seed);
  const def = structuredClone(base) as unknown as AvatarDefinition;
  const p = def.body.primary;
  const primary: SurfaceDefinition = {
    type: t.surface,
    width: Math.round(p.width * t.wscale),
    height: Math.round(p.height * t.hscale),
    depth: Math.round(p.depth * Math.min(t.wscale, t.hscale)),
    roundness: t.roundness,
  };
  def.name = `ruler-${t.hash.toString(16)}`;
  def.body = { ...def.body, primary };
  def.colors = { body: t.color, eyes: EYES };
  return def;
}

/** The workspace's own face (login page before an email is typed, empty states). */
export const WORKSPACE_SEED = 'ruler-reports';
