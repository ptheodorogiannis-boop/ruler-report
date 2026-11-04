// The editor's star on a table row (docs/superpowers/specs/2026-11-04-editor-report-management-design.md §5): shown on row
// hover and focus, pressed while the row is starred. Rendered only when the editor passes onStarRow.
import { Star } from 'lucide-react';
import { tr } from '@/lib/i18n/request';

export function StarRowButton({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="row-star no-print"
      aria-pressed={on}
      aria-label={on ? tr('editor.unstarRow') : tr('editor.starRow')}
      title={on ? tr('editor.unstarRow') : tr('editor.starRow')}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Star size={12} className={on ? 'fill-current' : undefined} />
    </button>
  );
}
