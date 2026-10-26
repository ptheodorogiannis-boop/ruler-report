// Pure 12-column grid maths shared by the editor (client) and the layout seeder (server).
// Vertical compaction + push-down on collision, the behaviour of gridigo / react-grid-layout.
import { GRID_COLS } from './types';

export interface GridRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const collides = (a: GridRect, b: GridRect) => a.id !== b.id && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const byPos = <T extends GridRect>(items: T[]) => [...items].sort((a, b) => a.y - b.y || a.x - b.x);

/** Move every item as far up as it can go without overlapping an item placed before it. */
export function compact<T extends GridRect>(items: T[]): T[] {
  const placed: T[] = [];
  for (const it of byPos(items)) {
    let y = it.y;
    while (y > 0 && !placed.some((p) => collides({ ...it, y: y - 1 }, p))) y--;
    const moved = y === it.y ? it : { ...it, y };
    placed.push(moved);
  }
  return items.map((it) => placed.find((p) => p.id === it.id)!);
}

/** Resolve overlaps with `moving` by pushing the others down (recursively), then compact around it. */
export function resolve<T extends GridRect>(items: T[], moving: T): T[] {
  let out = items.map((it) => (it.id === moving.id ? moving : it));
  const queue: T[] = [moving];
  let steps = 0;
  while (queue.length && steps++ < 10_000) {
    const m = queue.shift()!;
    for (const other of byPos(out)) {
      if (other.id === moving.id || !collides(m, other)) continue;
      const pushed = { ...other, y: m.y + m.h } as T;
      out = out.map((it) => (it.id === other.id ? pushed : it));
      queue.push(pushed);
    }
  }
  const result = compactAround(out, moving.id);
  return items.map((it) => result.find((p) => p.id === it.id)!);
}

/** Compact everything except `pinId`, which keeps its place. */
function compactAround<T extends GridRect>(items: T[], pinId: string): T[] {
  const pin = items.find((it) => it.id === pinId)!;
  const placed: T[] = [pin];
  for (const it of byPos(items.filter((i) => i.id !== pinId))) {
    let y = it.y;
    while (y > 0 && !placed.some((p) => collides({ ...it, y: y - 1 }, p))) y--;
    let cand = { ...it, y } as T;
    while (placed.some((p) => collides(cand, p))) cand = { ...cand, y: cand.y + 1 };
    placed.push(cand);
  }
  return placed;
}

export const clampX = (x: number, w: number, cols = GRID_COLS) => Math.max(0, Math.min(cols - w, Math.round(x)));

export function moveItem<T extends GridRect>(items: T[], id: string, x: number, y: number, cols = GRID_COLS): T[] {
  const it = items.find((i) => i.id === id);
  if (!it) return items;
  const nx = clampX(x, it.w, cols);
  const ny = Math.max(0, Math.round(y));
  if (nx === it.x && ny === it.y) return items;
  return resolve(items, { ...it, x: nx, y: ny });
}

export function resizeItem<T extends GridRect>(items: T[], id: string, w: number, h: number, min = { w: 1, h: 1 }, cols = GRID_COLS): T[] {
  const it = items.find((i) => i.id === id);
  if (!it) return items;
  const nw = Math.max(min.w, Math.min(cols - it.x, Math.round(w)));
  const nh = Math.max(min.h, Math.round(h));
  if (nw === it.w && nh === it.h) return items;
  return resolve(items, { ...it, w: nw, h: nh });
}

/** First free slot (lowest y, then lowest x) where a w×h item fits. */
export function firstFree(items: GridRect[], w: number, h: number, cols = GRID_COLS): { x: number; y: number } {
  const maxY = items.reduce((m, it) => Math.max(m, it.y + it.h), 0);
  for (let y = 0; y <= maxY; y++) for (let x = 0; x + w <= cols; x++) if (!items.some((it) => collides({ id: '__probe', x, y, w, h }, it))) return { x, y };
  return { x: 0, y: maxY };
}

/** Place items that have no position (x,y < 0) one after another, then compact. */
export function flow<T extends GridRect>(items: T[], cols = GRID_COLS): T[] {
  const placed: T[] = items.filter((it) => it.x >= 0 && it.y >= 0);
  for (const it of items) {
    if (it.x >= 0 && it.y >= 0) continue;
    const w = Math.min(it.w, cols);
    const pos = firstFree(placed, w, it.h, cols);
    placed.push({ ...it, ...pos, w });
  }
  const compacted = compact(placed);
  return items.map((it) => compacted.find((p) => p.id === it.id)!);
}

export const gridHeight = (items: GridRect[]) => items.reduce((m, it) => Math.max(m, it.y + it.h), 0);

export const overlaps = (items: GridRect[]) => items.some((a, i) => items.slice(i + 1).some((b) => collides(a, b)));
