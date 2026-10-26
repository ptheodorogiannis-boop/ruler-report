// Public goals page (spec v3 §3.4): one link per project, `/g/<token>`, optionally behind a password, that shows every
// goal of the project with its live progress. The token lives on the project; stopping the share clears it.
import { db } from '@/lib/db';
import { randomToken, sha256 } from '@/lib/crypto';
import { getIntegrationDef } from '@/lib/catalog/integrations';
import { goalProgress, periodFor, type GoalProgress } from '@/lib/services/goals';
import { today } from '@/lib/util/dates';

export interface GoalsPageGoal {
  id: number;
  title: string;
  frequency: string;
  target: number;
  direction: string;
  referenceKey: string;
  slug: string;
  platform: string;
  progress: GoalProgress;
}

export interface GoalsPageData {
  project: { id: number; name: string; logo: string | null; timezone: string; locale: string; dateFormat: string; currency: string; decimalSeparatorFormat: string; goalsPassword: string | null };
  company: { name: string; logo: string | null; brandColor: string; hidePoweredBy: boolean };
  goals: GoalsPageGoal[];
}

/** Mint the project's goals link (idempotent: an existing token is kept so a link already sent keeps working). */
export async function createGoalsShare(projectId: number): Promise<string> {
  const p = await db.project.findUniqueOrThrow({ where: { id: projectId }, select: { goalsToken: true } });
  if (p.goalsToken) return p.goalsToken;
  const token = randomToken(24);
  await db.project.update({ where: { id: projectId }, data: { goalsToken: token } });
  return token;
}

/** Same scheme as Report.password: the hash is stored, never the password. `null` removes it. */
export async function setGoalsPassword(projectId: number, password: string | null): Promise<void> {
  await db.project.update({ where: { id: projectId }, data: { goalsPassword: password ? sha256(password) : null } });
}

/** Stop sharing: the link stops resolving and the password goes with it. */
export async function stopGoalsShare(projectId: number): Promise<void> {
  await db.project.update({ where: { id: projectId }, data: { goalsToken: null, goalsPassword: null } });
}

/** A goal whose metric could not be read still gets a card, marked "no data", rather than vanishing from the page. */
function noProgress(g: { id: number; title: string; referenceKey: string; frequency: string; target: number; direction: string }, tz: string): GoalProgress {
  const period = periodFor(g.frequency, today(tz));
  return { goalId: g.id, title: g.title, referenceKey: g.referenceKey, frequency: g.frequency, period, current: null, target: g.target, progressPct: null, estimatedEnd: null, daysRemaining: 0, situation: 'no_data', direction: g.direction, additive: true, history: [] };
}

/** The public page is an iframe on the client's site: the provider reads are cached per link for a few minutes (review F-I5). */
const PAGE_TTL = 5 * 60_000;
const pageCache = new Map<string, { at: number; goals: GoalsPageGoal[] }>();

/** Everything the public page renders, or null when the token is unknown or the share was stopped. */
export async function goalsPageData(token: string): Promise<GoalsPageData | null> {
  if (!token || token.length < 16) return null;
  const project = await db.project.findUnique({
    where: { goalsToken: token },
    include: { company: true, goals: { include: { integration: { include: { project: true } } }, orderBy: { id: 'asc' } } },
  });
  if (!project) return null;
  // the cheap part (project, password, which goals) is always fresh; the provider reads are keyed by it and cached
  const key = `${token}|${project.goals.map((g) => `${g.id}:${g.target}:${g.referenceKey}`).join(',')}`;
  const hit = pageCache.get(key);
  const goals = hit && Date.now() - hit.at < PAGE_TTL ? hit.goals : await loadGoals(project);
  if (!hit || hit.goals !== goals) pageCache.set(key, { at: Date.now(), goals });
  if (pageCache.size > 500) for (const k of [...pageCache.keys()].slice(0, 100)) pageCache.delete(k);
  return {
    project: { id: project.id, name: project.name, logo: project.logo, timezone: project.timezone, locale: project.locale, dateFormat: project.dateFormat, currency: project.currency, decimalSeparatorFormat: project.decimalSeparatorFormat, goalsPassword: project.goalsPassword },
    company: { name: project.company.name, logo: project.company.logo, brandColor: project.company.brandColor, hidePoweredBy: project.company.hidePoweredBy },
    goals,
  };
}

type ProjectWithGoals = Awaited<ReturnType<typeof loadProjectForPage>>;
async function loadProjectForPage(token: string) {
  return db.project.findUniqueOrThrow({ where: { goalsToken: token }, include: { company: true, goals: { include: { integration: { include: { project: true } } }, orderBy: { id: 'asc' } } } });
}
/** The provider reads: progress per goal, without writing history (anonymous views leave no trace). */
async function loadGoals(project: ProjectWithGoals): Promise<GoalsPageGoal[]> {
  return Promise.all(
    project.goals.map(async (g) => ({
      id: g.id,
      title: g.title,
      frequency: g.frequency,
      target: g.target,
      direction: g.direction,
      referenceKey: g.referenceKey,
      slug: g.integration.slug,
      platform: getIntegrationDef(g.integration.slug)?.name ?? g.integration.slug,
      progress: await goalProgress(g, undefined, { record: false }).catch(() => noProgress(g, project.timezone)),
    })),
  );
}
