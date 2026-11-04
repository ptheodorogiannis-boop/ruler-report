'use client';

// The editor's right-click menu in a channel block (docs/superpowers/specs/2026-11-04-editor-report-management-design.md §4):
// "Add metric here" opens the metric picker at the same spot; on a widget, Duplicate and Remove. Shift + right-click keeps
// the browser's own menu (the editor checks that before opening this one). Esc, a click outside or a scroll closes it.
import { useEffect, useRef, useState } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { useT } from '@/components/i18n-provider';
import type { SourceInfo } from '@/lib/layout/types';
import { MetricPicker, type MetricPayload } from './metric-picker';

const ITEM = 'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-slate-50';
/** keep the menu, and the taller picker, inside the window */
const clampTo = (at: { x: number; y: number }, w: number, h: number) => ({ left: Math.max(8, Math.min(at.x, window.innerWidth - w - 8)), top: Math.max(8, Math.min(at.y, window.innerHeight - h - 8)) });

export function BlockMenu({ at, source, widgetId, existing, onPick, onDuplicate, onRemove, onClose }: { at: { x: number; y: number }; source?: Pick<SourceInfo, 'id' | 'slug'>; widgetId: string | null; existing: Set<string>; onPick: (p: MetricPayload) => void; onDuplicate: () => void; onRemove: () => void; onClose: () => void }) {
  const t = useT();
  const [picking, setPicking] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const out = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const scroll = (e: Event) => box.current && !box.current.contains(e.target as Node) && onClose();
    window.addEventListener('pointerdown', out, true);
    window.addEventListener('keydown', esc);
    window.addEventListener('scroll', scroll, true);
    return () => {
      window.removeEventListener('pointerdown', out, true);
      window.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [onClose]);

  if (picking && source)
    return (
      <div ref={box} className="card rmenu-pop fixed z-50 max-h-[420px] w-80 overflow-y-auto p-3" style={clampTo(at, 320, 420)}>
        <MetricPicker source={source} existing={existing} onPick={(p) => (onPick(p), onClose())} variant="popover" onClose={onClose} />
      </div>
    );
  return (
    <div ref={box} role="menu" className="card rmenu-pop fixed z-50 w-56 p-1" style={clampTo(at, 224, 120)} data-block-menu>
      {source && (
        <button type="button" role="menuitem" className={ITEM} onClick={() => setPicking(true)} autoFocus>
          <Plus size={14} /> {t('editor.addMetricHere')}
        </button>
      )}
      {widgetId && (
        <>
          <button type="button" role="menuitem" className={ITEM} onClick={() => (onDuplicate(), onClose())}>
            <Copy size={14} /> {t('common.duplicate')}
          </button>
          <button type="button" role="menuitem" className={`${ITEM} text-red-600`} onClick={() => (onRemove(), onClose())}>
            <Trash2 size={14} /> {t('common.remove')}
          </button>
        </>
      )}
    </div>
  );
}
