// A platform's mark on a small tile, for the connect screens. Platforms with a real brand glyph get their brand colour
// behind a white glyph; platforms the icon set does not carry get a neutral tile with ink initials, so a monogram
// never passes for a brand mark. Decorative: the platform's name is always written next to it.
import { lettermark, platformIcon } from '@/lib/catalog/platform-icons';
import { getIntegrationDef } from '@/lib/catalog/integrations';
import { PlatformIcon } from '@/components/platform-icon';

const SIZE = { sm: { box: 'h-6 w-6 rounded-md', icon: 14 }, md: { box: 'h-8 w-8 rounded-lg', icon: 16 }, lg: { box: 'h-9 w-9 rounded-lg', icon: 20 } } as const;

export function PlatformTile({ slug, size = 'md', dim = false }: { slug: string; size?: keyof typeof SIZE; dim?: boolean }) {
  const def = getIntegrationDef(slug);
  const s = SIZE[size];
  const monogram = !platformIcon(slug) && !!def && def.category !== 'custom' && def.category !== 'calls';
  if (monogram)
    return (
      <span aria-hidden="true" data-tile="monogram" className={`flex ${s.box} shrink-0 items-center justify-center border border-[var(--line-strong)] bg-[var(--paper)] text-[11px] font-semibold text-ink-2 ${dim ? 'opacity-40' : ''}`}>
        {lettermark(def!.name)}
      </span>
    );
  return (
    <span aria-hidden="true" data-tile="brand" className={`flex ${s.box} shrink-0 items-center justify-center ${dim ? 'opacity-40' : ''}`} style={{ background: def?.color ?? 'var(--ink-3)' }}>
      <PlatformIcon slug={slug} size={s.icon} tone="white" />
    </span>
  );
}
