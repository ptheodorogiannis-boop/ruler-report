'use client';

// Sidebar icons drawn in-house (24 px, 1.75 stroke) with one moving part each. The parent NavLink is a motion
// element with "rest" / "hover" variants; the parts below inherit them, so hovering the link moves the needle, the
// flap, the bars, the bolt... in the motion verb: slide along a track and click into place (docs/DESIGN.md).
import { motion } from 'motion/react';
import type { ReactNode } from 'react';

const ease = [0.2, 0.7, 0.2, 1] as const;
const t = { duration: 0.45, ease };
const svgProps = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
const Svg = ({ children }: { children: ReactNode }) => <svg {...svgProps}>{children}</svg>;

export const Gauge = () => (
  <Svg>
    <path d="M4 15a8 8 0 0 1 16 0" />
    <path d="M4 15h2M18 15h2M12 7v2" />
    <motion.path d="M12 15 L12 9.5" variants={{ rest: { rotate: -42 }, hover: { rotate: 38 } }} transition={t} style={{ transformOrigin: '12px 15px' }} />
    <circle cx="12" cy="15" r="1.3" fill="currentColor" stroke="none" />
  </Svg>
);

export const Folder = () => (
  <Svg>
    <path d="M3 8v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7l-2-2H5a2 2 0 0 0-2 2z" />
    <motion.path d="M3 11h18" variants={{ rest: { y: 0 }, hover: { y: -2 } }} transition={t} />
  </Svg>
);

export const Bars = () => (
  <Svg>
    <path d="M3 20h18" />
    {[
      ['7', '14'],
      ['12', '9'],
      ['17', '12'],
    ].map(([x, y], i) => (
      <motion.path key={x} d={`M${x} 20V${y}`} variants={{ rest: { scaleY: 1 }, hover: { scaleY: [0.2, 1] } }} transition={{ ...t, delay: i * 0.06 }} style={{ transformOrigin: `${x}px 20px` }} />
    ))}
  </Svg>
);

export const Tiles = () => (
  <Svg>
    <motion.rect x="3" y="3" width="8" height="10" rx="1.5" variants={{ rest: { x: 0, y: 0 }, hover: { x: -1, y: -1 } }} transition={t} />
    <motion.rect x="13" y="3" width="8" height="6" rx="1.5" variants={{ rest: { x: 0, y: 0 }, hover: { x: 1, y: -1 } }} transition={t} />
    <motion.rect x="13" y="11" width="8" height="10" rx="1.5" variants={{ rest: { x: 0, y: 0 }, hover: { x: 1, y: 1 } }} transition={t} />
    <motion.rect x="3" y="15" width="8" height="6" rx="1.5" variants={{ rest: { x: 0, y: 0 }, hover: { x: -1, y: 1 } }} transition={t} />
  </Svg>
);

export const Template = () => (
  <Svg>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18" />
    {[12, 15, 18].map((y, i) => (
      <motion.path key={y} d={`M7 ${y}h${10 - i * 3}`} variants={{ rest: { x: 0 }, hover: { x: [-3, 0] } }} transition={{ ...t, delay: i * 0.05 }} />
    ))}
  </Svg>
);

export const Bolt = () => (
  <Svg>
    <motion.path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" variants={{ rest: { pathLength: 1, opacity: 1 }, hover: { pathLength: [0, 1], opacity: [0.4, 1] } }} transition={{ duration: 0.55, ease }} />
  </Svg>
);

export const Target = () => (
  <Svg>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <motion.circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" variants={{ rest: { x: 0, y: 0, scale: 1 }, hover: { x: [6, 0], y: [-6, 0], scale: [0.6, 1] } }} transition={{ duration: 0.5, ease }} />
  </Svg>
);

export const Blend = () => (
  <Svg>
    <motion.circle cx="9" cy="12" r="6" variants={{ rest: { x: 0 }, hover: { x: 1.5 } }} transition={t} />
    <motion.circle cx="15" cy="12" r="6" variants={{ rest: { x: 0 }, hover: { x: -1.5 } }} transition={t} />
  </Svg>
);

export const Plug = () => (
  <Svg>
    <path d="M6 13h12" />
    <path d="M12 13v8" />
    <motion.g variants={{ rest: { y: -2 }, hover: { y: 0 } }} transition={t}>
      <path d="M9 3v4M15 3v4" />
      <path d="M7 7h10v2a5 5 0 0 1-10 0z" />
    </motion.g>
  </Svg>
);

export const Boxes = () => (
  <Svg>
    <path d="M4 13h7v8H4zM13 13h7v8h-7z" />
    <motion.path d="M8.5 3h7v8h-7z" variants={{ rest: { y: 0 }, hover: { y: [-3, 0] } }} transition={{ duration: 0.45, ease: [0.3, 1.4, 0.4, 1] }} />
  </Svg>
);

export const Book = () => (
  <Svg>
    <path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z" />
    <motion.path d="M20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z" variants={{ rest: { scaleX: 1 }, hover: { scaleX: [0.2, 1] } }} transition={t} style={{ transformOrigin: '12px 12px' }} />
  </Svg>
);

export const Bell = () => (
  <Svg>
    <motion.g variants={{ rest: { rotate: 0 }, hover: { rotate: [0, -14, 11, -6, 0] } }} transition={{ duration: 0.7, ease: 'easeInOut' }} style={{ transformOrigin: '12px 4px' }}>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
    </motion.g>
    <path d="M10 21a2 2 0 0 0 4 0" />
  </Svg>
);

export const Gear = () => (
  <Svg>
    <motion.g variants={{ rest: { rotate: 0 }, hover: { rotate: 60 } }} transition={{ duration: 0.6, ease }} style={{ transformOrigin: '12px 12px' }}>
      <path d="M12 3.5l1.6 1.9 2.4-.6.6 2.4 2.3.9-.9 2.3 1.5 2-1.5 2 .9 2.3-2.3.9-.6 2.4-2.4-.6L12 20.5l-1.6-1.9-2.4.6-.6-2.4-2.3-.9.9-2.3L4.5 12 6 10l-.9-2.3 2.3-.9.6-2.4 2.4.6z" />
    </motion.g>
    <circle cx="12" cy="12" r="3" />
  </Svg>
);

export const Exit = () => (
  <Svg>
    <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
    <motion.g variants={{ rest: { x: 0 }, hover: { x: 3 } }} transition={t}>
      <path d="M14 8l4 4-4 4M18 12H9" />
    </motion.g>
  </Svg>
);

export const NAV_ICONS = { gauge: Gauge, folder: Folder, bars: Bars, tiles: Tiles, template: Template, bolt: Bolt, target: Target, blend: Blend, plug: Plug, boxes: Boxes, book: Book, bell: Bell, gear: Gear, exit: Exit } as const;
export type NavIconName = keyof typeof NAV_ICONS;
