// A platform's mark (spec §4): the brand icon in the platform colour, a lettermark for brands the icon set does not
// carry, a small glyph for generic sources. Inline SVG, server-safe, no client JavaScript; the name is carried by the
// text next to it, so the mark itself is decorative.
import { getIntegrationDef } from '@/lib/catalog/integrations';
import { fallbackGlyph, lettermark, platformIcon, type Glyph } from '@/lib/catalog/platform-icons';

export type IconSize = 14 | 16 | 20 | 24 | 36;
export type IconTone = 'brand' | 'ink' | 'white';

const GLYPHS: Record<Glyph, React.ReactNode> = {
  table: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M9 10v10M15 10v10" />
    </>
  ),
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  plug: (
    <>
      <path d="M6 13h12M12 13v8" />
      <path d="M9 3v4M15 3v4" />
      <path d="M7 7h10v2a5 5 0 0 1-10 0z" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4h2l2.5 11h11L21 7H7" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="17" cy="19" r="1.5" />
    </>
  ),
};

export function PlatformIcon({ slug, size = 16, tone = 'brand', className }: { slug: string; size?: IconSize; tone?: IconTone; className?: string }) {
  const def = getIntegrationDef(slug);
  const brand = def?.color ?? '#636d7c';
  const color = tone === 'brand' ? brand : tone === 'white' ? '#fff' : 'currentColor';
  const icon = platformIcon(slug);
  if (icon)
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" data-icon={icon.title} className={className} style={{ flex: 'none' }}>
        <path d={icon.path} fill={color} />
      </svg>
    );
  if (!def || def.category === 'custom' || def.category === 'calls') {
    const g = fallbackGlyph(def?.category ?? 'custom');
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" data-glyph={g} className={className} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
        {GLYPHS[g]}
      </svg>
    );
  }
  const letters = lettermark(def.name);
  const style = { ['--pm' as string]: `${size}px`, background: tone === 'white' ? 'transparent' : brand, color: '#fff' } as React.CSSProperties;
  return (
    <span className={['pmark', className].filter(Boolean).join(' ')} data-lettermark={letters} aria-hidden="true" style={style}>
      {letters}
    </span>
  );
}
