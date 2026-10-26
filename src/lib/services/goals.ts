// "Controle": tracked metrics with targets, pacing and alerts.
import type { Goal, Integration, Project } from '@prisma/client';
import { localeForPublic, t, type Locale } from '@/lib/i18n';
import { findWidget } from '@/lib/catalog/build';
import { db } from '@/lib/db';
import { FetchSession, resolveWidget } from '@/lib/engine/resolve';
import { toCtx } from '@/lib/engine/report';
import { addDays, diffDays, parseDate, today, fmtDate } from '@/lib/util/dates';
import { emitEvent } from './webhooks';
import { notify, sendEmail } from './messaging';

export type Situation = 'high' | 'ideal' | 'average' | 'low' | 'no_data';

export function periodFor(frequency: string, now: string) {
  const d = parseDate(now);
  if (frequency === 'weekly') {
    const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
    const start = addDays(now, -dow);
    return { key: `W${start}`, start, end: addDays(start, 6) };
  }
  const start = fmtDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
  const end = fmtDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
  return { key: `M${start.slice(0, 7)}`, start, end };
}

export interface GoalProgress {
  goalId: number;
  title: string;
  referenceKey: string;
  frequency: string;
  period: { start: string; end: string };
  current: number | null;
  target: number;
  progressPct: number | null;
  estimatedEnd: number | null;
  daysRemaining: number;
  situation: Situation;
  direction: string;
  additive: boolean;
  history: { date: string; value: number }[];
}

type GoalFull = Goal & { integration: Integration & { project: Project } };

async function valueFor(goal: GoalFull, start: string, end: string): Promise<{ value: number | null; additive: boolean }> {
  const ctx = toCtx(goal.integration, goal.integration.project);
  const w = findWidget(ctx.slug, goal.referenceKey.split(':').slice(1).join(':') || goal.referenceKey, ctx.config as any);
  if (!w) return { value: null, additive: false };
  const v = await resolveWidget({ integration: ctx, widget: w, range: { start, end }, session: new FetchSession() });
  return { value: v.type === 'number' ? v.value : null, additive: !!w.canAggregate && w.calc.kind === 'sum' };
}

export async function goalProgress(goal: GoalFull, now?: string, opts: { record?: boolean } = {}): Promise<GoalProgress> {
  const tz = goal.integration.project.timezone;
  const t = now ?? today(tz);
  const p = periodFor(goal.frequency, t);
  const upTo = t < p.end ? addDays(t, -1) < p.start ? p.start : addDays(t, -1) : p.end; // data through yesterday
  const total = diffDays(p.start, p.end) + 1;
  const elapsed = Math.max(1, diffDays(p.start, upTo) + 1);
  const { value, additive } = await valueFor(goal, p.start, upTo);
  const higher = goal.direction !== 'lower_better';
  const estimatedEnd = value == null ? null : additive ? Math.round((value / elapsed) * total * 100) / 100 : value;
  let progress: number | null = null;
  if (value != null && goal.target > 0) progress = higher ? (value / goal.target) * 100 : value === 0 ? 100 : (goal.target / value) * 100;
  let situation: Situation = 'no_data';
  if (value != null && goal.target > 0) {
    const expected = additive ? goal.target * (elapsed / total) : goal.target;
    const ratio = higher ? value / expected : value === 0 ? 2 : expected / value;
    situation = ratio >= 1.1 ? 'high' : ratio >= 0.9 ? 'ideal' : ratio >= 0.6 ? 'average' : 'low';
  }
  if (value != null && opts.record !== false) {
    await db.goalValue.upsert({ where: { goalId_date: { goalId: goal.id, date: t } }, update: { value }, create: { goalId: goal.id, date: t, value } }).catch(() => null);
  }
  const history = (await db.goalValue.findMany({ where: { goalId: goal.id, date: { gte: p.start, lte: p.end } }, orderBy: { date: 'asc' } })).map((h) => ({ date: h.date, value: h.value }));
  return {
    goalId: goal.id,
    title: goal.title,
    referenceKey: goal.referenceKey,
    frequency: goal.frequency,
    period: { start: p.start, end: p.end },
    current: value,
    target: goal.target,
    progressPct: progress == null ? null : Math.round(progress * 10) / 10,
    estimatedEnd,
    daysRemaining: Math.max(0, diffDays(t, p.end)),
    situation,
    direction: goal.direction,
    additive,
    history,
  };
}

export async function loadGoal(id: number): Promise<GoalFull | null> {
  return db.goal.findUnique({ where: { id }, include: { integration: { include: { project: true } } } }) as Promise<GoalFull | null>;
}

/** Evaluates every goal, firing control_goal_met / control_goal_not_met webhooks and in-app alerts. */
/** Goal alerts by e-mail (spec v3 §3.3): the goal's own addresses, same dedupe as the bell. */
const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
/** The short "final / target for period" line of a missed-goal notification, in `loc`. */
export const goalMissedLine = (loc: Locale, value: number | string | null | undefined, target: number, start: string, end: string) => t(loc, 'email.goalMissedShort', { value: value ?? t(loc, 'email.noData'), target, start, end });

export function goalEmailHtml(subject: string, body: string, url: string, loc: Locale = 'en'): string {
  return `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:auto"><h2 style="margin:0 0 8px">${escHtml(subject)}</h2><p>${escHtml(body)}</p><p><a href="${escHtml(url)}" style="display:inline-block;background:#1a36e6;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${escHtml(t(loc, 'email.openGoals'))}</a></p><p style="color:#94a3b8;font-size:12px">${escHtml(t(loc, 'email.goalFooter'))}</p></div>`;
}
async function goalMail(g: Pick<GoalFull, 'alertEmails' | 'projectId'>, companyId: number, subject: string, body: string, loc: Locale = 'en') {
  const to = Array.isArray(g.alertEmails) ? (g.alertEmails as string[]).filter((e) => typeof e === 'string' && e.includes('@')) : [];
  if (!to.length) return;
  const base = process.env.APP_URL || 'http://localhost:3100';
  await sendEmail(to, `[Ruler Reports] ${subject}`, goalEmailHtml(subject, body, `${base}/projects/${g.projectId}?tab=goals`, loc), { companyId });
}

export async function evaluateGoals(companyId?: number, now?: string) {
  const goals = (await db.goal.findMany({ where: companyId ? { project: { companyId } } : {}, include: { integration: { include: { project: true } } } })) as GoalFull[];
  const out: { goalId: number; event?: string }[] = [];
  const base = process.env.APP_URL || 'http://localhost:3100';
  for (const g of goals) {
    try {
      const day = now ?? today(g.integration.project.timezone);
      const prog = await goalProgress(g, day);
      const period = periodFor(g.frequency, day);
      const cid = g.integration.project.companyId;
      const loc = localeForPublic(g.integration.project);
      let event: string | undefined;
      // met this period
      const higher = g.direction !== 'lower_better';
      const metNow = prog.current != null && (higher ? prog.current >= g.target : prog.current <= g.target && prog.additive === false);
      if (g.alert && metNow && higher && g.lastMetPeriod !== period.key) {
        event = 'control_goal_met';
        await db.goal.update({ where: { id: g.id }, data: { lastMetPeriod: period.key, lastSituation: prog.situation, lastAlertAt: new Date() } });
        await emitEvent(cid, g.projectId, 'control_goal_met', { goal_id: g.id, title: t(loc, 'email.goalMet', { title: g.title }), current: prog.current, target: g.target, url: `${base}/projects/${g.projectId}?tab=goals` });
        await notify(cid, g.projectId, t(loc, 'email.goalMet', { title: g.title }), `${prog.current} / ${g.target}`, `/projects/${g.projectId}?tab=goals`);
        await goalMail(g, cid, t(loc, 'email.goalMet', { title: g.title }), t(loc, 'email.goalMetBody', { title: g.title, current: prog.current ?? '', target: g.target, start: period.start, end: period.end }), loc);
      }
      // previous (closed) period evaluation
      const prev = periodFor(g.frequency, addDays(period.start, -1));
      if (g.alert && g.lastClosedPeriod !== prev.key && g.createdAt < parseDate(period.start)) {
        const { value } = await valueFor(g, prev.start, prev.end);
        const met = value != null && (higher ? value >= g.target : value <= g.target);
        await db.goal.update({ where: { id: g.id }, data: { lastClosedPeriod: prev.key } });
        if (!met) {
          event = 'control_goal_not_met';
          await emitEvent(cid, g.projectId, 'control_goal_not_met', { goal_id: g.id, title: t(loc, 'email.goalMissed', { title: g.title }), final: value, target: g.target, period: prev, url: `${base}/projects/${g.projectId}?tab=goals` });
          await notify(cid, g.projectId, t(loc, 'email.goalMissed', { title: g.title }), goalMissedLine(loc, value, g.target, prev.start, prev.end), `/projects/${g.projectId}?tab=goals`);
          await goalMail(g, cid, t(loc, 'email.goalMissed', { title: g.title }), t(loc, 'email.goalMissedBody', { title: g.title, value: value ?? t(loc, 'email.noData'), target: g.target, start: prev.start, end: prev.end }), loc);
        }
      }
      // mid-period drift alert: low situation, once per period
      if (g.alert && prog.situation === 'low' && g.lastSituation !== 'low:' + period.key) {
        await db.goal.update({ where: { id: g.id }, data: { lastSituation: 'low:' + period.key } });
        await notify(cid, g.projectId, t(loc, 'email.goalOffTrack', { title: g.title }), `Currently ${prog.current} vs target ${g.target} (projected ${prog.estimatedEnd}).`, `/projects/${g.projectId}?tab=goals`);
        await goalMail(g, cid, t(loc, 'email.goalOffTrack', { title: g.title }), t(loc, 'email.goalOffTrackBody', { title: g.title, current: prog.current ?? '', target: g.target, projected: prog.estimatedEnd ?? '' }), loc);
      }
      out.push({ goalId: g.id, event });
    } catch (e) {
      out.push({ goalId: g.id, event: `error: ${(e as Error).message}` });
    }
  }
  return out;
}
