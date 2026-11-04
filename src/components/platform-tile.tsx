// A platform's mark on a small inset tile, for the connect screens: the platform's glyph in ink on a quiet white tile
// (docs/DESIGN.md › Ruler glass pass: one accent at a time, so no wall of brand colours). Platforms the icon set does not
// carry show their initials the same way, so a monogram never passes for a brand mark. Decorative: the platform's
// name is always written next to it.
import { lettermark, platformIcon } from '@/lib/catalog/platform-icons';
import { getIntegrationDef } from '@/lib/catalog/integrations';
import { PlatformIcon } from '@/components/platform-icon';

const SIZE = { sm: { box: 'h-7 w-7 rounded-lg', icon: 14 }, md: { box: 'h-9 w-9 rounded-xl', icon: 16 }, lg: { box: 'h-10 w-10 rounded-xl', icon: 20 } } as const;

export function PlatformTile({ slug, size = 'md', dim = false }: { slug: string; size?: keyof typeof SIZE; dim?: boolean }) {
  const def = getIntegrationDef(slug);
  const s = SIZE[size];
  const monogram = !platformIcon(slug) && !!def && def.category !== 'custom' && def.category !== 'calls';
  const cls = `tile-mark flex ${s.box} shrink-0 items-center justify-center ${dim ? 'opacity-40' : ''}`;
  if (monogram)
    return (
      <span aria-hidden="true" data-tile="monogram" className={`${cls} text-[11px] font-semibold text-ink-2`}>
        {lettermark(def!.name)}
      </span>
    );
  return (
    <span aria-hidden="true" data-tile="brand" className={`${cls} text-ink`}>
      <PlatformIcon slug={slug} size={s.icon} tone="ink" />
    </span>
  );
}
