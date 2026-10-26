import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const alt = 'Ruler Reports';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** The share card: the mark, the name, and a ruler band across the bottom (the signature, in one frame). */
export default function OpenGraphImage() {
  const ticks = Array.from({ length: 31 }, (_, i) => i);
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#f4f5f2', color: '#101418', padding: '72px 80px 64px', fontFamily: 'Inter, Arial, sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: '#1a36e6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 700 }}>R</div>
          <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.5 }}>Ruler Reports</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: -2, lineHeight: 1.02 }}>Marketing reports your clients can trust.</div>
          <div style={{ fontSize: 26, color: '#525b66' }}>Multichannel reports, live dashboards, automations and goals for agencies.</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', height: 40, borderBottom: '2px solid #101418' }}>
            {ticks.map((i) => (
              <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start' }}>
                <div style={{ width: 2, height: i % 7 === 0 ? 28 : 12, background: i % 7 === 0 ? '#101418' : '#636d7c' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, color: '#525b66' }}>
            <span>1 Sep 2026</span>
            <span style={{ color: '#101418', fontWeight: 600 }}>September 2026</span>
            <span>30 Sep 2026</span>
          </div>
        </div>
      </div>
    ),
    size
  );
}
