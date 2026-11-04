import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const alt = 'Ruler Reports';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** The image renderer cannot read CSS variables: these mirror the tokens in globals.css (ground, ink, ink-3, brand). */
const C = { ground: '#e4e4e2', ink: '#0e0e0e', ink3: '#575756', tick: '#a1a19f', brand: '#db0100' };

/** The share card: the Ruler wordmark, the name, and a ruler band across the bottom (the signature, in one frame). */
export default function OpenGraphImage() {
  const ticks = Array.from({ length: 31 }, (_, i) => i);
  const wordmark = `data:image/svg+xml;base64,${readFileSync(path.join(process.cwd(), 'public/brand/wordmark.svg')).toString('base64')}`;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: C.ground, color: C.ink, padding: '72px 80px 64px', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={wordmark} width={151} height={40} alt="" />
          <div style={{ fontSize: 28, color: C.ink3 }}>Reports</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 64, letterSpacing: -2, lineHeight: 1.04 }}>Marketing reports your clients can trust</div>
          <div style={{ fontSize: 26, color: C.ink3 }}>Multichannel reports, live dashboards, automations and goals for agencies</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', height: 40, borderBottom: `2px solid ${C.ink}` }}>
            {ticks.map((i) => (
              <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start' }}>
                <div style={{ width: 2, height: i % 7 === 0 ? 28 : 12, background: i % 7 === 0 ? C.ink : C.tick }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, color: C.ink3 }}>
            <span>1 Sep 2026</span>
            <span style={{ color: C.brand }}>September 2026</span>
            <span>30 Sep 2026</span>
          </div>
        </div>
      </div>
    ),
    size
  );
}
