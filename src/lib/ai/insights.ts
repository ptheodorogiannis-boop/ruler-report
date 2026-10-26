// "Reportei AI" equivalent. With ANTHROPIC_API_KEY it asks Claude to write the analysis; without a key it
// falls back to a deterministic rule-based analyst so the feature always works offline.
import type { ReportData, RenderedBlock } from '@/lib/engine/types';
import { formatValue } from '@/lib/util/format';
import { type Tone } from './tones';
export { TONES, TONE_LABEL, type Tone } from './tones';

interface Fact {
  platform: string;
  account: string;
  label: string;
  value: number;
  prev: number | null;
  change: number | null;
  format: RenderedBlock['widget']['format'];
  currency?: string;
  goodWhenUp: boolean;
  /** spend-like metrics: a change is a decision, not a performance win or loss */
  neutral: boolean;
}

/** The number facts of a report, or of one section when `sectionId` is given (per-block analysis, spec v3 §4.4). */
export function extractFacts(data: ReportData, sectionId?: string): Fact[] {
  const out: Fact[] = [];
  for (const s of data.sections) {
    if (sectionId && s.id !== sectionId) continue;
    for (const b of s.blocks) {
      const v = b.widget.value;
      if (v.type !== 'number' || v.value == null) continue;
      out.push({
        platform: b.platform,
        account: b.account_name,
        label: b.widget.label,
        value: v.value,
        prev: v.comparison?.value ?? null,
        change: v.comparison?.change_pct ?? null,
        format: b.widget.format,
        currency: b.widget.currency,
        goodWhenUp: b.widget.diff_type !== 'positive_bad',
        neutral: b.widget.diff_type === 'neutral',
      });
    }
  }
  return out;
}

let numberFormat: string | undefined;
const fmt = (f: Fact, v: number) => formatValue(v, f.format, { currency: f.currency, decimalSeparatorFormat: numberFormat });
const pctText = (c: number) => `${c > 0 ? '+' : ''}${c.toFixed(1)}%`;

/** Rule-based analysis → HTML */
export function heuristicAnalysis(data: ReportData, projectName: string): string {
  const facts = extractFacts(data).filter((f) => f.change != null);
  if (facts.length === 0) return `<p>No comparison data available for ${projectName} in this period, so trends cannot be assessed yet.</p>`;
  const impact = (f: Fact) => Math.abs(f.change!) * (f.goodWhenUp ? (f.change! > 0 ? 1 : -1) : f.change! < 0 ? 1 : -1);
  const scored = facts.filter((f) => !f.neutral).map((f) => ({ f, good: (f.goodWhenUp ? f.change! > 0 : f.change! < 0), mag: Math.abs(f.change!) })).filter((x) => x.mag >= 5);
  const wins = scored.filter((x) => x.good).sort((a, b) => b.mag - a.mag).slice(0, 4);
  const risks = scored.filter((x) => !x.good).sort((a, b) => b.mag - a.mag).slice(0, 4);
  const li = (x: { f: Fact }) => `<li><strong>${x.f.platform} – ${x.f.label}:</strong> ${fmt(x.f, x.f.value)} (${pctText(x.f.change!)} vs ${fmt(x.f, x.f.prev ?? 0)})</li>`;

  const spend = facts.filter((f) => /amount spent|spend/i.test(f.label) && f.format === 'currency');
  const results = facts.filter((f) => /conversions|purchases|leads/i.test(f.label) && !/cost|rate/i.test(f.label));
  let efficiency = '';
  if (spend.length && results.length) {
    const s = spend[0];
    const r = results[0];
    if (s.change != null && r.change != null) {
      const d = r.change - s.change;
      const bothUp = r.change > 0 && s.change > 0;
      const bothDown = r.change < 0 && s.change < 0;
      const verdict =
        d > 2
          ? bothUp
            ? 'Results are growing faster than investment: there is room to scale.'
            : bothDown
              ? 'Results fell less than spend, so cost per result improved.'
              : 'Results held up better than spend: efficiency improved.'
          : d < -2
            ? bothUp
              ? 'Investment is growing faster than results: review targeting, creatives and landing pages before scaling.'
              : bothDown
                ? 'Results fell faster than spend: check what was cut or paused.'
                : 'Efficiency deteriorated: results moved the wrong way relative to spend.'
            : 'Results moved in line with spend; efficiency is stable.';
      efficiency = `<p><strong>Efficiency:</strong> spend moved ${pctText(s.change)} while ${r.label.toLowerCase()} moved ${pctText(r.change)}. ${verdict}</p>`;
    }
  }
  void impact;
  const next: string[] = [];
  if (risks[0]) next.push(`Investigate the drop in <em>${risks[0].f.platform} – ${risks[0].f.label}</em> (${pctText(risks[0].f.change!)}).`);
  if (wins[0]) next.push(`Double down on what worked: <em>${wins[0].f.platform} – ${wins[0].f.label}</em> (${pctText(wins[0].f.change!)}).`);
  next.push('Set goals for the headline metrics so deviations trigger alerts mid-month.');

  return [
    `<h3>Summary for ${projectName}</h3>`,
    `<p>${data.range.start} → ${data.range.end}${data.comparison ? `, compared with ${data.comparison.start} → ${data.comparison.end}` : ''}. ${scored.length} of ${facts.length} tracked metrics moved by 5% or more.</p>`,
    wins.length ? `<h4>What improved</h4><ul>${wins.map(li).join('')}</ul>` : '',
    risks.length ? `<h4>Needs attention</h4><ul>${risks.map(li).join('')}</ul>` : '',
    efficiency,
    `<h4>Suggested next steps</h4><ul>${next.map((n) => `<li>${n}</li>`).join('')}</ul>`,
  ].join('\n');
}

function compactFacts(data: ReportData) {
  return extractFacts(data)
    .slice(0, 160)
    .map((f) => `${f.platform} | ${f.account} | ${f.label}: ${fmt(f, f.value)}${f.prev != null ? ` (prev ${fmt(f, f.prev)}, ${f.change != null ? pctText(f.change) : 'n/a'})` : ''}`)
    .join('\n');
}

export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY;

async function claude(system: string, user: string, maxTokens = 1400): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j: any = await res.json();
  return (j.content ?? []).map((c: any) => c.text ?? '').join('');
}

/** The instruction each tone adds to the analyst prompt (spec v3 §4.4). */
export const TONE_PROMPTS: Record<Tone, string> = {
  general: 'Structure: Summary (2-3 sentences), What improved, Needs attention, Suggested next steps (3 bullets).',
  performance: 'Lead with efficiency: cost per result, CPC, CPM, CTR, conversion rate, ROAS — each with its change — then the volume metrics. End with one sentence on whether the spend bought results.',
  worst: 'Name the one metric that moved the most in the wrong direction, explain what likely drove it using only the other numbers of this block, and say what to check first. Two short paragraphs, no headings.',
  opportunities: 'Exactly three concrete actions for the next period as a <ul>, each tied to a metric of this block and the size of the opportunity. No summary, no headings.',
  executive: 'At most five sentences, no headings, no bullets: the result, the biggest win, the biggest risk, what it cost, the one decision needed.',
};
const SYSTEM_BASE = `You are a senior performance-marketing analyst writing the commentary section of a client report for an agency.
Rules: only use numbers present in the data; never invent figures; be specific (name the platform and metric); keep it short and plain-spoken;
output clean HTML using only <h3>, <h4>, <p>, <ul>, <li>, <strong>, <em>.`;
const SYSTEM_ANALYST = `${SYSTEM_BASE} ${TONE_PROMPTS.general}
Write in the language requested.`;

export async function analyse(data: ReportData, projectName: string, opts: { language?: string; notes?: string; decimalSeparatorFormat?: string } = {}): Promise<{ html: string; ai: boolean }> {
  numberFormat = opts.decimalSeparatorFormat;
  if (!aiConfigured()) return { html: heuristicAnalysis(data, projectName), ai: false };
  try {
    const html = await claude(
      SYSTEM_ANALYST,
      `Client: ${projectName}\nPeriod: ${data.range.start} to ${data.range.end}${data.comparison ? ` vs ${data.comparison.start} to ${data.comparison.end}` : ''}\nLanguage: ${opts.language ?? 'English'}\n${opts.notes ? `Agency notes: ${opts.notes}\n` : ''}\nMetrics:\n${compactFacts(data)}`
    );
    return { html: html.replace(/^```html\s*|```$/g, '').trim(), ai: true };
  } catch (e) {
    return { html: heuristicAnalysis(data, projectName) + `<p><em>(AI unavailable: ${(e as Error).message})</em></p>`, ai: false };
  }
}

const isEfficiency = (f: Fact) => /cpc|cpm|cpa|cost per|cost\b|ctr|roas|rate|frequency/i.test(f.label);
const liFact = (f: Fact) => `<li><strong>${f.platform} – ${f.label}:</strong> ${fmt(f, f.value)}${f.change != null ? ` (${pctText(f.change)} vs ${fmt(f, f.prev ?? 0)})` : ''}</li>`;
/** Positive = moved the right way; spend-like metrics score 0. */
const scoreOf = (f: Fact) => (f.change == null || f.neutral ? 0 : f.goodWhenUp ? f.change : -f.change);

/** Rule-based per-block analysis shaped by the tone (spec v3 §4.4); the offline fallback of `analyseBlock`. */
export function heuristicBlock(data: ReportData, blockId: string, tone: Tone, projectName: string): string {
  const sec = data.sections.find((s) => s.id === blockId);
  const name = sec?.title ?? 'this block';
  const facts = extractFacts(data, blockId);
  if (!facts.length) return '<p>No numeric metrics in this block to summarise.</p>';
  const withChange = facts.filter((f) => f.change != null);
  const byScore = [...withChange].sort((a, b) => scoreOf(b) - scoreOf(a));
  const best = byScore.find((f) => scoreOf(f) > 0);
  const worst = [...byScore].reverse().find((f) => scoreOf(f) < 0);
  const spend = facts.find((f) => f.neutral && f.format === 'currency');
  const spendText = spend ? `${fmt(spend, spend.value)}${spend.change != null ? ` (${pctText(spend.change)})` : ''}` : null;
  switch (tone) {
    case 'performance': {
      const eff = facts.filter(isEfficiency);
      const vol = facts.filter((f) => !isEfficiency(f));
      return `<h3>${name}: efficiency first</h3>${eff.length ? `<ul>${eff.map(liFact).join('')}</ul>` : '<p>No efficiency metrics in this block.</p>'}${vol.length ? `<h4>Volume</h4><ul>${vol.map(liFact).join('')}</ul>` : ''}${spendText ? `<p>Spend: ${spendText}.</p>` : ''}`;
    }
    case 'worst': {
      if (!worst) return `<p>Nothing in ${name} moved the wrong way${withChange.length ? '' : ' (no comparison data)'}.</p>`;
      return `<p><strong>${worst.platform} – ${worst.label}</strong> moved the wrong way the most: ${fmt(worst, worst.value)} (${pctText(worst.change!)} vs ${fmt(worst, worst.prev ?? 0)}).</p><p>${spendText && spend !== worst ? `Spend was ${spendText}; ` : ''}check the pacing, the audience and the creative behind this metric before the next period.</p>`;
    }
    case 'opportunities': {
      const picks = [...byScore].reverse().filter((f) => scoreOf(f) < 0).slice(0, 3);
      const items = picks.length ? picks : byScore.slice(0, 3);
      if (!items.length) return `<ul><li>Add a comparison period to ${name} to see where the opportunities are.</li></ul>`;
      return `<ul>${items.map((f) => `<li>Work on <strong>${f.label}</strong> (${fmt(f, f.value)}${f.change != null ? `, ${pctText(f.change)}` : ''}): ${scoreOf(f) < 0 ? "bringing it back to last period's level" : 'pushing it further'} is the clearest gain in ${name}.</li>`).join('')}</ul>`;
    }
    case 'executive': {
      const s: string[] = [];
      s.push(`${name} for ${projectName}: ${facts.length} metrics tracked${withChange.length ? ', compared with the previous period' : ''}.`);
      if (best) s.push(`Biggest win: ${best.label} at ${fmt(best, best.value)} (${pctText(best.change!)}).`);
      if (worst) s.push(`Biggest risk: ${worst.label} at ${fmt(worst, worst.value)} (${pctText(worst.change!)}).`);
      if (spendText) s.push(`It cost ${spendText}.`);
      s.push(worst ? `Decision needed: keep the current setup while ${worst.label} is addressed, or pause it.` : 'No decision needed this period.');
      return `<p>${s.slice(0, 5).join(' ')}</p>`;
    }
    default: {
      const wins = byScore.filter((f) => scoreOf(f) >= 5).slice(0, 4);
      const risks = [...byScore].reverse().filter((f) => scoreOf(f) <= -5).slice(0, 4);
      return `<h3>${name}</h3><p>${facts.length} metrics${withChange.length ? `, ${wins.length} improved and ${risks.length} need attention` : ' (no comparison data)'}.</p>${wins.length ? `<h4>What improved</h4><ul>${wins.map(liFact).join('')}</ul>` : ''}${risks.length ? `<h4>Needs attention</h4><ul>${risks.map(liFact).join('')}</ul>` : ''}`;
    }
  }
}

/** Per-block AI analysis with a tone (spec v3 §4.4): facts of one section only; the heuristic fallback keeps the tone's shape. */
export async function analyseBlock(data: ReportData, blockId: string, opts: { tone: Tone; language?: string; notes?: string; projectName: string; decimalSeparatorFormat?: string }): Promise<{ html: string; ai: boolean }> {
  numberFormat = opts.decimalSeparatorFormat;
  const sec = data.sections.find((s) => s.id === blockId);
  if (!aiConfigured()) return { html: heuristicBlock(data, blockId, opts.tone, opts.projectName), ai: false };
  try {
    const facts = extractFacts(data, blockId)
      .slice(0, 160)
      .map((f) => `${f.platform} | ${f.account} | ${f.label}: ${fmt(f, f.value)}${f.prev != null ? ` (prev ${fmt(f, f.prev)}, ${f.change != null ? pctText(f.change) : 'n/a'})` : ''}`)
      .join('\n');
    const html = await claude(
      `${SYSTEM_BASE} ${TONE_PROMPTS[opts.tone]}\nWrite in the language requested.`,
      `Client: ${opts.projectName}\nBlock: ${sec?.title ?? blockId}\nPeriod: ${data.range.start} to ${data.range.end}${data.comparison ? ` vs ${data.comparison.start} to ${data.comparison.end}` : ''}\nLanguage: ${opts.language ?? 'English'}\n${opts.notes ? `Agency notes: ${opts.notes}\n` : ''}\nMetrics of this block only:\n${facts}`,
      900,
    );
    return { html: html.replace(/^\`\`\`html\s*|\`\`\`$/g, '').trim(), ai: true };
  } catch (e) {
    return { html: heuristicBlock(data, blockId, opts.tone, opts.projectName) + `<p><em>(AI unavailable: ${(e as Error).message})</em></p>`, ai: false };
  }
}

/** "Ask your data" — answers a question about one report. */
export async function ask(data: ReportData, projectName: string, question: string): Promise<{ answer: string; ai: boolean }> {
  const facts = extractFacts(data);
  if (!aiConfigured()) {
    const q = question.toLowerCase();
    const words = q.split(/\W+/).filter((w) => w.length > 2);
    const ranked = facts
      .map((f) => ({ f, score: words.filter((w) => `${f.platform} ${f.label}`.toLowerCase().includes(w)).length }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    if (!ranked.length) return { answer: 'I could not match your question to a metric in this report. Try naming a platform or metric (e.g. "Meta Ads spend"). Set ANTHROPIC_API_KEY for free-form answers.', ai: false };
    return { answer: ranked.map(({ f }) => `${f.platform} – ${f.label}: ${fmt(f, f.value)}${f.change != null ? ` (${pctText(f.change)} vs previous period)` : ''}`).join('\n'), ai: false };
  }
  const answer = await claude(
    'You answer questions about a marketing report. Use ONLY the metrics provided. If the data does not contain the answer, say so. Be concise; plain text.',
    `Client: ${projectName}\nPeriod: ${data.range.start} to ${data.range.end}\n\nMetrics:\n${compactFacts(data)}\n\nQuestion: ${question}`,
    700
  );
  return { answer, ai: true };
}

export interface Slide {
  title: string;
  bullets: string[];
  kpis: { label: string; value: string; change: string | null }[];
}

/** "Reportei Studio" equivalent: turn a report into a slide-deck outline. */
export async function studioDeck(data: ReportData, projectName: string, brief?: string): Promise<{ slides: Slide[]; ai: boolean }> {
  const slides: Slide[] = [];
  const facts = extractFacts(data);
  slides.push({ title: `${projectName}: performance review`, bullets: [`${data.range.start} → ${data.range.end}`, data.comparison ? `vs ${data.comparison.start} → ${data.comparison.end}` : 'No comparison period', brief ?? ''].filter(Boolean), kpis: [] });
  for (const s of data.sections) {
    const nums = s.blocks.filter((b) => b.widget.value.type === 'number').slice(0, 6);
    if (!nums.length) continue;
    const kpis = nums.map((b) => {
      const v = b.widget.value as any;
      return { label: `${b.platform} · ${b.widget.label}`, value: formatValue(v.value, b.widget.format, { currency: b.widget.currency }), change: v.comparison?.change_pct != null ? pctText(v.comparison.change_pct) : null };
    });
    const movers = facts.filter((f) => nums.some((b) => b.platform === f.platform && b.widget.label === f.label) && f.change != null).sort((a, b) => Math.abs(b.change!) - Math.abs(a.change!)).slice(0, 2);
    slides.push({ title: s.title, bullets: movers.map((f) => `${f.label} ${f.change! > 0 ? 'rose' : 'fell'} ${Math.abs(f.change!).toFixed(1)}% to ${fmt(f, f.value)}`), kpis });
  }
  const a = await analyse(data, projectName);
  const bullets = [...a.html.matchAll(/<li>(.*?)<\/li>/g)].map((m) => m[1].replace(/<[^>]+>/g, '')).slice(0, 6);
  slides.push({ title: 'Insights & next steps', bullets, kpis: [] });
  return { slides, ai: a.ai };
}
