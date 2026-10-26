'use client';

// 12-column editable grid: drag by handle to move, corner handle to resize, HTML5 drop from the metrics panel.
// Items are laid out with CSS grid (same markup as the read-only renderer); during a drag the moving item
// follows the pointer with a transform while its grid slot (the dashed placeholder) tracks the drop position.
import clsx from 'clsx';
import { useRef, useState } from 'react';
import { GRID_COLS, GRID_GAP, GRID_ROW_HEIGHT, type LayoutWidget } from '@/lib/layout/types';
import { clampX, moveItem, resizeItem } from '@/lib/layout/grid';
import { gridStyle } from './widgets';

export const DND_TYPE = 'application/x-rr-widget';
let currentPayload: string | null = null;
/** The metrics panel calls this on dragstart so `dragover` (which cannot read the data) can size the ghost. */
export const setDragPayload = (p: string | null) => (currentPayload = p);

export interface DragHandleProps {
  onPointerDown: (e: React.PointerEvent) => void;
  style: React.CSSProperties;
  title: string;
}
export interface ItemApi {
  dragHandle: DragHandleProps;
  resizeHandle: React.ReactNode;
  dragging: boolean;
}

interface Props {
  items: LayoutWidget[];
  onChange: (items: LayoutWidget[]) => void;
  renderItem: (w: LayoutWidget, api: ItemApi) => React.ReactNode;
  onDropNew?: (payload: string, pos: { x: number; y: number }) => void;
  dropSize?: (payload: string) => { w: number; h: number };
  minSize?: (w: LayoutWidget) => { w: number; h: number };
  editable: boolean;
  emptyHint?: string;
}

export function GridCanvas({ items, onChange, renderItem, onDropNew, dropSize, minSize, editable, emptyHint }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<LayoutWidget[] | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [resizing, setResizing] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const shown = live ?? items;

  const metrics = () => {
    const rect = ref.current!.getBoundingClientRect();
    const colW = (rect.width - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
    return { rect, colW, rowH: GRID_ROW_HEIGHT };
  };
  const toCell = (clientX: number, clientY: number, offX = 0, offY = 0) => {
    const { rect, colW, rowH } = metrics();
    return { x: Math.round((clientX - rect.left - offX) / (colW + GRID_GAP)), y: Math.max(0, Math.round((clientY - rect.top - offY) / (rowH + GRID_GAP))) };
  };

  const startDrag = (e: React.PointerEvent, id: string) => {
    if (!editable || e.button !== 0) return;
    e.preventDefault();
    const el = (e.currentTarget as HTMLElement).closest('.ritem') as HTMLElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const grabX = e.clientX - r.left;
    const grabY = e.clientY - r.top;
    let cur = items;
    setLive(cur);
    setDrag({ id, dx: 0, dy: 0 });
    const onMove = (ev: PointerEvent) => {
      const { x, y } = toCell(ev.clientX, ev.clientY, grabX, grabY);
      cur = moveItem(cur, id, x, y);
      setLive(cur);
      const it = cur.find((i) => i.id === id)!;
      const { rect, colW, rowH } = metrics();
      setDrag({ id, dx: ev.clientX - rect.left - grabX - it.x * (colW + GRID_GAP), dy: ev.clientY - rect.top - grabY - it.y * (rowH + GRID_GAP) });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setDrag(null);
      setLive(null);
      if (cur !== items) onChange(cur);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const startResize = (e: React.PointerEvent, id: string) => {
    if (!editable || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = (e.currentTarget as HTMLElement).closest('.ritem') as HTMLElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let cur = items;
    setLive(cur);
    setResizing(id);
    const onMove = (ev: PointerEvent) => {
      const { colW, rowH } = metrics();
      const w = Math.round((ev.clientX - r.left + GRID_GAP) / (colW + GRID_GAP));
      const h = Math.round((ev.clientY - r.top + GRID_GAP) / (rowH + GRID_GAP));
      const it = cur.find((i) => i.id === id)!;
      cur = resizeItem(cur, id, w, h, minSize?.(it) ?? { w: 1, h: 1 });
      setLive(cur);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setResizing(null);
      setLive(null);
      if (cur !== items) onChange(cur);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // ── drop from the "Add metrics" panel ──
  const onDragOver = (e: React.DragEvent) => {
    if (!editable || !onDropNew || !e.dataTransfer.types.includes(DND_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const size = (currentPayload && dropSize?.(currentPayload)) || { w: 3, h: 2 };
    const { x, y } = toCell(e.clientX, e.clientY, 0, 0);
    setGhost({ x: clampX(x, size.w), y, ...size });
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (ref.current && e.relatedTarget instanceof Node && ref.current.contains(e.relatedTarget)) return;
    setGhost(null);
  };
  const onDrop = (e: React.DragEvent) => {
    if (!editable || !onDropNew) return;
    const payload = e.dataTransfer.getData(DND_TYPE) || currentPayload;
    setGhost(null);
    if (!payload) return;
    e.preventDefault();
    const size = dropSize?.(payload) ?? { w: 3, h: 2 };
    const { x, y } = toCell(e.clientX, e.clientY, 0, 0);
    onDropNew(payload, { x: clampX(x, size.w), y });
    currentPayload = null;
  };

  const dragged = drag ? shown.find((i) => i.id === drag.id) : null;
  return (
    <div
      ref={ref}
      className={clsx('rgrid rgrid-edit relative', editable && 'rounded-xl outline-dashed outline-1 outline-transparent transition', editable && ghost && 'outline-brand/60', shown.length === 0 && 'min-h-[88px]')}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {shown.length === 0 && !ghost && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">{emptyHint ?? 'Empty block — add metrics from the panel or drop them here.'}</div>}
      {dragged && <div className="ritem rplaceholder" style={gridStyle(dragged)} />}
      {ghost && <div className="ritem rplaceholder" style={gridStyle(ghost)} />}
      {shown.map((w) => {
        const isDragging = drag?.id === w.id;
        return (
          <div
            key={w.id}
            className={clsx('ritem', isDragging && 'ritem-dragging', resizing === w.id && 'ritem-resizing')}
            style={{ ...gridStyle(w), ...(isDragging && drag ? { transform: `translate(${drag.dx}px, ${drag.dy}px)` } : {}) }}
            data-w={w.w}
          >
            {renderItem(w, {
              dragging: isDragging,
              dragHandle: { onPointerDown: (e) => startDrag(e, w.id), style: { touchAction: 'none', cursor: isDragging ? 'grabbing' : 'grab' }, title: 'Drag to move' },
              resizeHandle: editable ? <div className="rresize" title="Drag to resize" style={{ touchAction: 'none' }} onPointerDown={(e) => startResize(e, w.id)} /> : null,
            })}
          </div>
        );
      })}
    </div>
  );
}
