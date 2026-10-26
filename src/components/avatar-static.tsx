// A still face rendered on the server (docs/DESIGN.md › Pass 5b). The avatar library draws a fixed expression as one
// static SVG and never touches it again, so for a page that only shows such a face (the 404) the same picture can be
// computed here with @bible-strong/avatar-core and emitted as markup: the page then ships none of the library's client
// code, the face is in the HTML from the first paint and nothing moves at hydration. The markup mirrors the library's
// (`bs-avatar` box, `bs-avatar__svg`, the -150..150 viewBox, head clip, eyes) so the library's stylesheet and
// `.bs-avatar` rules in globals.css apply unchanged. For a face that watches the pointer or plays an animation, use
// UserAvatar / LoginAvatar from ./avatar.
import { renderAvatarDefinition, type ExpressionKey } from '@bible-strong/avatar-core';
import clsx from 'clsx';
import { avatarFor } from '@/lib/avatar';

export function StaticAvatar({ seed, size = 32, expression = 'neutral', label, className }: { seed: string; size?: number; /** an expression key of the base character, e.g. 'far-right-glance' */ expression?: ExpressionKey; label?: string; className?: string }) {
  const def = avatarFor(seed);
  const { geometry, colors } = renderAvatarDefinition(def, expression);
  const clip = `${def.name}-${expression}-head`;
  return (
    <div className={clsx('bs-avatar', 'shrink-0', className)} style={{ width: size, height: size }} role="img" aria-label={label ?? 'Avatar'}>
      <svg className="bs-avatar__svg" viewBox="-150 -150 300 300" aria-hidden="true">
        <defs>
          <clipPath id={clip}>
            <path d={geometry.headPath} />
          </clipPath>
        </defs>
        {geometry.backPaths.map((d, i) => (
          <path key={`back-${i}`} d={d} fill={colors.body} />
        ))}
        <path d={geometry.headPath} fill={colors.body} />
        <g clipPath={`url(#${clip})`} fill={colors.eyes}>
          <path d={geometry.leftPath} opacity={geometry.leftVisible ? 1 : 0} />
          <path d={geometry.rightPath} opacity={geometry.rightVisible ? 1 : 0} />
        </g>
        {geometry.frontPaths.map((d, i) => (
          <path key={`front-${i}`} d={d} fill={colors.body} />
        ))}
      </svg>
    </div>
  );
}
