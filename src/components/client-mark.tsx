// The client's mark (spec §3): the logo when the project has one, otherwise a monogram in the brand colour — the same
// construction as the agency's BrandMark, so every client has a face wherever it is named.
import clsx from 'clsx';
import { MediaImage } from './media-image';

export type MarkSize = 24 | 32 | 40 | 48;

const firstGrapheme = (name: string) => {
  const t = name.trim();
  if (!t) return '?';
  const seg = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: string }) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter;
  const first = seg ? [...new seg('und', { granularity: 'grapheme' }).segment(t)][0]?.segment : [...t][0];
  return (first ?? t[0]).toLocaleUpperCase();
};

export function ClientMark({ name, logo, color, size = 32, className }: { name: string; logo?: string | null; color?: string; size?: MarkSize; className?: string }) {
  // without a colour the mark inherits the frame's --brand (the agency colour)
  const style = { ['--cm' as string]: `${size}px`, ...(color ? { ['--brand' as string]: color, ['--brand-soft' as string]: `${color}1a` } : {}) } as React.CSSProperties;
  if (logo)
    return (
      <span className={clsx('cmark', className)} style={style} title={name}>
        <MediaImage src={logo} alt={name} fit="contain" />
      </span>
    );
  return (
    <span className={clsx('cmark cmark-mono', className)} style={style} role="img" aria-label={name}>
      {firstGrapheme(name)}
    </span>
  );
}
