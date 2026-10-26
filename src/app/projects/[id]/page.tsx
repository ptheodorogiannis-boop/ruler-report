import Link from 'next/link';
import { getT } from '@/lib/i18n/server';
import { LOCALES, LOCALE_LABEL, presetLabel } from '@/lib/i18n';
import { notFound } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ExternalLink, Pause, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { AppShell, Empty, PageHeader, Tabs } from '@/components/shell';
import { ActionForm, ConfirmButton, CopyButton } from '@/components/action-form';
import { MediaField } from '@/components/media-picker';
import { MediaImage } from '@/components/media-image';
import { HealthChip } from '@/components/health-chip';
import { reconnectUrl } from '@/lib/services/health';
import { oauthAvailable } from '@/lib/oauth/providers';
import { GoalForm, type GoalOption } from '@/components/goal-form';
import { Delta, PlatformBadge } from '@/components/widgets';
import { addTimelineAction, checkIntegrationAction, updateIntegrationCampaignsAction, sendHeldRunAction, deleteAutomationAction, updateProjectAction, deleteGoalAction, deleteProjectAction, deleteTimelineAction, refreshColumnsAction, removeIntegrationAction, runAutomationAction, saveAutomationAction, saveGoalAction, shareGoalsAction, toggleAutomationAction, toggleIntegrationAction } from '@/app/actions/app';
import { assertProject, canAdmin, canWrite, requirePrincipal } from '@/lib/auth';
import { getCatalog } from '@/lib/catalog/build';
import { getIntegrationDef, isAdsSlug } from '@/lib/catalog/integrations';
import { CampaignScopeEditor } from '@/components/campaign-scope-editor';
import { scopeSummary } from '@/lib/engine/campaigns';
import { campaignScopeOf, listCampaignsFor } from '@/lib/services/campaigns';
import { db } from '@/lib/db';
import { goalProgress } from '@/lib/services/goals';
import { companyOverview, OVERVIEW_KPIS } from '@/lib/services/overview';
import { formatValue } from '@/lib/util/format';
import { shareUrl } from '@/lib/services/reports';
import { pdfAvailable } from '@/lib/services/pdf';
import { requestBaseUrl } from '@/lib/share';

export const dynamic = 'force-dynamic';

const TABS = ['overview', 'integrations', 'reports', 'dashboards', 'automations', 'goals', 'timeline', 'settings'];

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; new?: string; campaigns?: string }> }) {
  const { t, locale } = await getT();
  const p = await requirePrincipal();
  const { id } = await params;
  const sp = await searchParams;
  const project = await assertProject(p, Number(id)).catch(() => null);
  if (!project) notFound();
  const tab = TABS.includes(sp.tab ?? '') ? sp.tab! : 'overview';
  // ?campaigns=<integrationId> opens the campaign scope editor under that row (spec v3 §2.2)
  const editingCampaignsId = Number(sp.campaigns) || 0;
  const write = canWrite(p);
  const editingRow = editingCampaignsId ? await db.integration.findFirst({ where: { id: editingCampaignsId, projectId: project.id } }) : null;
  const editingCampaigns = editingRow ? await listCampaignsFor(editingRow, project).catch(() => null) : null;

  const [integrations, reports, dashboards, automations, goals, timeline, templates] = await Promise.all([
    db.integration.findMany({ where: { projectId: project.id }, orderBy: [{ slug: 'asc' }, { name: 'asc' }] }),
    db.report.findMany({ where: { projectId: project.id, kind: 'report' }, orderBy: { createdAt: 'desc' }, take: 50 }),
    db.report.findMany({ where: { projectId: project.id, kind: 'dashboard' }, orderBy: { createdAt: 'desc' } }),
    db.automation.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'desc' }, include: { runs: { orderBy: { startedAt: 'desc' }, take: 1 } } }),
    db.goal.findMany({ where: { projectId: project.id }, include: { integration: { include: { project: true } } } }),
    db.timelineEvent.findMany({ where: { projectId: project.id }, orderBy: { date: 'desc' }, take: 50 }),
    db.template.findMany({ where: { kind: 'report', OR: [{ companyId: null }, { companyId: p.companyId }] }, orderBy: [{ isDefault: 'desc' }, { title: 'asc' }] }),
  ]);
  const fmt = { currency: project.currency, decimalSeparatorFormat: project.decimalSeparatorFormat };
  const goalsUrl = project.goalsToken ? `${await requestBaseUrl()}/g/${project.goalsToken}` : null;

  const tabs = [
    { id: 'overview', label: t('nav.overview') },
    { id: 'integrations', label: t('nav.integrations'), count: integrations.length },
    { id: 'reports', label: t('nav.reports'), count: reports.length },
    { id: 'dashboards', label: t('nav.dashboards'), count: dashboards.length },
    { id: 'automations', label: t('nav.automations'), count: automations.length },
    { id: 'goals', label: t('nav.goals'), count: goals.length },
    { id: 'timeline', label: t('common.timeline'), count: timeline.length },
    ...(write ? [{ id: 'settings', label: t('common.settings') }] : []),
  ];

  return (
    <AppShell active="/projects">
      <PageHeader
        title={project.name}
        subtitle={`${project.timezone} · ${project.currency} · ${t('projects.activeIntegrations', { count: integrations.filter((i) => i.status === 'active').length })}`}
        actions={
          <>
            {write && (
              <>
                <Link href={`/reports/new?project=${project.id}`} className="btn-primary">
                  <Plus size={14} /> {t('projects.newReport')}
                </Link>
                <Link href={`/reports/new?project=${project.id}&kind=dashboard`} className="btn">
                  <Plus size={14} /> {t('projects.newDashboard')}
                </Link>
              </>
            )}
            {canAdmin(p) && (
              <form action={deleteProjectAction}>
                <input type="hidden" name="id" value={project.id} />
                <ConfirmButton message={`Delete ${project.name} and ALL its integrations, reports and goals?`}>
                  <Trash2 size={14} />
                </ConfirmButton>
              </form>
            )}
          </>
        }
      />
      <Tabs tabs={tabs} current={tab} base={`/projects/${project.id}`} />

      {tab === 'overview' && <OverviewTab p={p} projectId={project.id} />}

      {tab === 'integrations' && (
        <div className="space-y-4">
          {write && (
            <div>
              <Link href={`/projects/${project.id}/connect`} className="btn-primary">
                <Plus size={14} /> {t('projects.connectIntegration')}
              </Link>
            </div>
          )}
          {integrations.length === 0 ? (
            <Empty title={t('projects.noIntegrationsTitle')} hint={t('projects.integrationsHint')} />
          ) : (
            <div className="card divide-y divide-[var(--line)]">
              {integrations.map((i) => {
                const def = getIntegrationDef(i.slug);
                const demo = i.credentials && def && ['demo'].includes(def.connector);
                return (
                  <div key={i.id}>
                  <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="w-44 shrink-0">
                      <PlatformBadge slug={i.slug} name={def?.name ?? i.slug} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{i.name}</div>
                      <div className="truncate text-xs text-slate-400">
                        {i.sourceId}
                        {def && def.connector === 'demo' && <span className="ml-2 rounded bg-slate-100 px-1 text-[11px] font-semibold text-slate-500">synthetic data</span>}
                        {def && def.connector !== 'demo' && <span className="ml-2 rounded bg-emerald-50 px-1 text-[11px] font-semibold text-emerald-700">live connector</span>}
                      </div>
                      {isAdsSlug(i.slug) && (
                        <div className="text-xs text-slate-500" data-campaigns-line>
                          Campaigns: {scopeSummary(campaignScopeOf(i))}
                          {write && (
                            <>
                              {' · '}
                              <Link href={`/projects/${project.id}?tab=integrations&campaigns=${editingCampaignsId === i.id ? '' : i.id}`} className="link">
                                {editingCampaignsId === i.id ? t('common.close') : t('campaigns.edit')}
                              </Link>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-xs">
                      <HealthChip health={i.health} tokenExpiresAt={i.tokenExpiresAt} healthCheckedAt={i.healthCheckedAt} error={i.healthError} lastError={i.lastError} lastSyncAt={i.lastSyncAt} />
                    </div>
                    <span className={`badge ${i.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{i.status}</span>
                    {write && (
                      <div className="flex gap-1">
                        {def && def.connector !== 'demo' && (
                          <Link href={reconnectUrl(i)} className={`btn ${i.health === 'failing' || i.health === 'expiring' ? 'btn-attention' : ''}`} title={oauthAvailable(i.slug) ? 'Sign in again and keep this integration' : 'Paste new credentials and keep this integration'}>
                            {oauthAvailable(i.slug) ? t('projects.reconnect') : t('projects.replaceCredentials')}
                          </Link>
                        )}
                        <form action={checkIntegrationAction}>
                          <input type="hidden" name="integrationId" value={i.id} />
                          <input type="hidden" name="projectId" value={project.id} />
                          <button className="btn" title={t('projects.checkTitle')}>
                            {t('projects.checkNow')}
                          </button>
                        </form>
                        {def?.archetype === 'custom' && (
                          <form action={refreshColumnsAction}>
                            <input type="hidden" name="id" value={i.id} />
                            <button className="btn" title="Re-detect columns">
                              <RefrechIcon />
                            </button>
                          </form>
                        )}
                        <form action={toggleIntegrationAction}>
                          <input type="hidden" name="id" value={i.id} />
                          <button className="btn" title={i.status === 'active' ? t('projects.pause') : t('projects.activate')}>
                            {i.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
                          </button>
                        </form>
                        <form action={removeIntegrationAction}>
                          <input type="hidden" name="id" value={i.id} />
                          <ConfirmButton message={`Remove ${i.name}? Reports already generated keep their data.`}>
                            <Trash2 size={14} />
                          </ConfirmButton>
                        </form>
                      </div>
                    )}
                    {demo && null}
                  </div>
                  {write && editingCampaignsId === i.id && isAdsSlug(i.slug) && (
                    <div className="px-4 pb-4" data-campaign-editor>
                      <ActionForm action={updateIntegrationCampaignsAction} submit={t('campaigns.save')} className="card space-y-3 p-4">
                        <input type="hidden" name="integrationId" value={i.id} />
                        <input type="hidden" name="projectId" value={project.id} />
                        <div className="label">{t('projects.defaultCampaignsOf', { name: i.name })}</div>
                        <CampaignScopeEditor value={campaignScopeOf(i)} campaigns={editingCampaigns} name="scope" />
                      </ActionForm>
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'reports' && <ReportList items={reports} kind="report" projectId={project.id} write={write} />}
      {tab === 'dashboards' && <ReportList items={dashboards} kind="dashboard" projectId={project.id} write={write} />}

      {tab === 'automations' && (
        <div className="space-y-4">
          {automations.length === 0 && <Empty title={t('automations.noneTitle')} hint={t('automations.hint')} />}
          {automations.map((a) => (
            <div key={a.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{a.title}</div>
                  <div className="text-xs text-slate-500">
                    {a.frequency} · {a.frequency === 'monthly' ? `day ${a.dayOfMonth}` : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][a.dayOfWeek]} at {String(a.hour).padStart(2, '0')}:00 · channels: {(a.channels as string[]).join(', ')}
                  </div>
                </div>
                <span className={`badge ${a.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{a.enabled ? 'enabled' : 'disabled'}</span>
                <div className="text-xs text-slate-500">next: {a.nextRunAt ? a.nextRunAt.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—'}</div>
                {a.runs[0]?.status === 'held' && (
                  <span className="inline-flex items-center gap-2 text-xs" data-run-held>
                    <span className="badge bg-amber-50 text-amber-800" title="A source failed; the client has not received this report">
                      held{Array.isArray((a.runs[0].detail as any)?.held) ? ` · ${(a.runs[0].detail as any).held.length} source${(a.runs[0].detail as any).held.length === 1 ? '' : 's'} failing` : ''}
                    </span>
                    {write && (
                      <form action={sendHeldRunAction}>
                        <input type="hidden" name="runId" value={a.runs[0].id} />
                        <button className="btn px-2 py-1" title="Refresh the sources that failed, then deliver the stored report">
                          {t('automations.sendNow')}
                        </button>
                      </form>
                    )}
                  </span>
                )}
                {write && (
                  <div className="flex gap-1">
                    <form action={runAutomationAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <button className="btn">{t('automations.runNow')}</button>
                    </form>
                    <form action={toggleAutomationAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <button className="btn">{a.enabled ? t('common.disable') : t('common.enable')}</button>
                    </form>
                    <form action={deleteAutomationAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <ConfirmButton message={t('automations.confirmDelete')}>
                        <Trash2 size={14} />
                      </ConfirmButton>
                    </form>
                  </div>
                )}
              </div>
              {a.lastError && <div className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">Last error: {a.lastError}</div>}
              {a.lastReportId && (
                <div className="mt-2 text-xs">
                  Last report:{' '}
                  <Link href={`/reports/${a.lastReportId}`} className="font-semibold text-brand">
                    #{a.lastReportId}
                  </Link>
                </div>
              )}
            </div>
          ))}
          {write && integrations.length > 0 && (
            <details className="card p-4" open={sp.new === 'automation' || automations.length === 0}>
              <summary className="cursor-pointer text-sm font-semibold">{t('automations.new')}</summary>
              <ActionForm action={saveAutomationAction} submit={t('automations.create')} className="mt-4 space-y-4">
                <input type="hidden" name="projectId" value={project.id} />
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="md:col-span-2">
                    <label className="label">{t('common.name')}</label>
                    <input name="title" className="input" defaultValue="Monthly client report" />
                  </div>
                  <div>
                    <label className="label">{t('automations.frequency')}</label>
                    <select name="frequency" className="input" defaultValue="monthly">
                      <option value="daily">{t('automations.daily')}</option>
                      <option value="weekly">{t('automations.weekly')}</option>
                      <option value="biweekly">{t('automations.biweekly')}</option>
                      <option value="monthly">{t('automations.monthly')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">{t('common.template')}</label>
                    <select name="templateId" className="input">
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">{t('automations.weekday')}</label>
                    <select name="dayOfWeek" className="input" defaultValue="1">
                      {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => (
                        <option key={d} value={i}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">{t('automations.dayOfMonth')}</label>
                    <input name="dayOfMonth" type="number" min={1} max={28} defaultValue={1} className="input" />
                  </div>
                  <div>
                    <label className="label">Hour ({project.timezone})</label>
                    <input name="hour" type="number" min={0} max={23} defaultValue={8} className="input" />
                  </div>
                  <div>
                    <label className="label">{t('automations.monthlyOn')}</label>
                    <select name="monthlyRule" className="input" defaultValue="day">
                      <option value="day">{t('automations.dayOfMonthAbove')}</option>
                      {(['first', 'last'] as const).flatMap((w) =>
                        ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => (
                          <option key={`${w}:${i}`} value={`${w}:${i}`}>
                            {w === 'first' ? t('automations.first') : t('automations.last')} {d}
                          </option>
                        )),
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="label">{t('automations.daily')}</label>
                    <label className="flex items-center gap-2 py-2 text-sm">
                      <input type="checkbox" name="weekdaysOnly" /> {t('automations.weekdaysOnly')}
                    </label>
                  </div>
                </div>
                <div>
                  <div className="label">{t('automations.integrationsToInclude')}</div>
                  <div className="grid gap-1 md:grid-cols-2">
                    {integrations.filter((i) => i.status === 'active').map((i) => (
                      <label key={i.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="integrationIds" value={i.id} defaultChecked />
                        {getIntegrationDef(i.slug)?.name} · {i.name}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="label">{t('automations.channels')}</div>
                  <div className="flex flex-wrap gap-4 text-sm">
                    {['email', 'in-app', 'whatsapp', 'slack', 'teams', 'discord', 'telegram'].map((c) => (
                      <label key={c} className="flex items-center gap-1.5">
                        <input type="checkbox" name="channels" value={c} defaultChecked={c === 'in-app'} /> {c}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 text-sm" data-delivery-flags>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" name="holdOnFailure" defaultChecked /> {t('automations.holdOnFailure')}
                  </label>
                  <label className={`flex items-center gap-1.5 ${pdfAvailable() ? '' : 'text-ink-3'}`} title={pdfAvailable() ? 'The report goes out as a PDF attachment too' : 'Needs the PDF service (Chromium through Playwright, PDF_ENABLED=auto)'}>
                    <input type="checkbox" name="attachPdf" disabled={!pdfAvailable()} /> Attach the PDF{!pdfAvailable() && ' (service off)'}
                  </label>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="label">{t('automations.emailRecipients')}</label>
                    <input name="emails" className="input" placeholder="client@example.com, boss@example.com" />
                  </div>
                  <div>
                    <label className="label">WhatsApp webhook URL (Make / Zapier / n8n / Z-API / Evolution)</label>
                    <input name="whatsappUrl" className="input" placeholder="https://hook.make.com/…" />
                  </div>
                  <div>
                    <label className="label">Slack incoming webhook</label>
                    <input name="slackUrl" className="input" placeholder="https://hooks.slack.com/services/…" />
                  </div>
                  <div>
                    <label className="label">Teams incoming webhook</label>
                    <input name="teamsUrl" className="input" />
                  </div>
                  <div>
                    <label className="label">Discord webhook</label>
                    <input name="discordUrl" className="input" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label">Telegram bot token</label>
                      <input name="telegramBotToken" className="input" />
                    </div>
                    <div>
                      <label className="label">Telegram chat id</label>
                      <input name="telegramChatId" className="input" />
                    </div>
                  </div>
                </div>
                <div className="flex gap-6 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="comparison" defaultChecked /> {t('automations.compare')}
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="attachAnalysis" defaultChecked /> {t('automations.analysisCard')}
                  </label>
                </div>
              </ActionForm>
            </details>
          )}
        </div>
      )}

      {tab === 'goals' && (
        <GoalsTab
          goals={goals}
          write={write}
          options={integrations
            .filter((i) => i.status === 'active')
            .map<GoalOption>((i) => ({
              integrationId: i.id,
              label: `${getIntegrationDef(i.slug)?.name} · ${i.name}`,
              metrics: getCatalog(i.slug, i.config as any)
                .filter((w) => w.component === 'number_v1')
                .map((w) => ({ key: w.reference_key, title: w.title })),
            }))}
          projectId={project.id}
          fmt={fmt}
          share={{ token: project.goalsToken, hasPassword: !!project.goalsPassword, url: goalsUrl, admin: canAdmin(p) }}
        />
      )}

      {tab === 'settings' && write && (
        <ActionForm action={updateProjectAction} submit={t('common.saveSettings')} successText={t('common.saved')} className="card grid gap-4 p-5 md:grid-cols-2">
          <input type="hidden" name="id" value={project.id} />
          <div className="md:col-span-2">
            <label className="label">{t('projects.clientLogo')}</label>
            <MediaField name="logo" defaultValue={project.logo} projectId={project.id} />
            <div className="mt-1 text-[11px] text-ink-3">{t('projects.logoHint')}</div>
          </div>
          <div>
            <label className="label">{t('common.name')}</label>
            <input name="name" className="input" required defaultValue={project.name} />
          </div>
          <div>
            <label className="label">{t('projects.timezone')}</label>
            <input name="timezone" className="input" defaultValue={project.timezone} />
          </div>
          <div>
            <label className="label">{t('projects.currency')}</label>
            <input name="currency" className="input" maxLength={3} defaultValue={project.currency} />
          </div>
          <div>
            <label className="label">{t('projects.dateFormat')}</label>
            <select name="dateFormat" className="input" defaultValue={project.dateFormat}>
              <option>DD/MM/YYYY</option>
              <option>MM/DD/YYYY</option>
              <option>YYYY-MM-DD</option>
            </select>
          </div>
          <div>
            <label className="label">{t('projects.decimalFormat')}</label>
            <select name="decimal" className="input" defaultValue={project.decimalSeparatorFormat}>
              <option value="comma_dot">1,234.56</option>
              <option value="dot_comma">1.234,56</option>
            </select>
          </div>
          <div>
            <label className="label">{t('common.language')}</label>
            <select name="locale" className="input" defaultValue={project.locale} data-project-locale>
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_LABEL[l]}
                </option>
              ))}
            </select>
            <div className="mt-1 text-[11px] text-ink-3">{t('projects.languageHint')}</div>
          </div>
        </ActionForm>
      )}
      {tab === 'timeline' && (
        <div className="space-y-4">
          {write && (
            <ActionForm action={addTimelineAction} submit={t('timeline.add')} className="card grid gap-3 p-4 md:grid-cols-4">
              <input type="hidden" name="projectId" value={project.id} />
              <div className="md:col-span-2">
                <label className="label">{t('timeline.what')}</label>
                <input name="title" className="input" required placeholder="Launched spring campaign" />
              </div>
              <div>
                <label className="label">{t('common.date')}</label>
                <input name="date" type="date" className="input" defaultValue={new Date().toISOString().slice(0, 10)} />
              </div>
              <div className="md:col-span-4">
                <label className="label">{t('timeline.notes')}</label>
                <textarea name="content" rows={2} className="input" placeholder="Context that helps explain the numbers…" />
              </div>
              <div className="md:col-span-4">
                <label className="label">{t('timeline.image')}</label>
                <MediaField name="image" projectId={project.id} label="Add an image" />
              </div>
            </ActionForm>
          )}
          {timeline.length === 0 ? (
            <Empty title={t('timeline.noneTitle')} hint={t('timeline.hint')} />
          ) : (
            <ol className="relative ml-3 space-y-4 border-l border-[var(--line)] pl-6">
              {timeline.map((t) => (
                <li key={t.id} className="relative">
                  <span className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand" />
                  <div className="card p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold">{t.title}</div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        {t.date}
                        {write && (
                          <form action={deleteTimelineAction}>
                            <input type="hidden" name="id" value={t.id} />
                            <button className="text-slate-400 hover:text-red-500">
                              <Trash2 size={13} />
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                    <div className="analysis text-sm" dangerouslySetInnerHTML={{ __html: t.content }} />
                    {t.image && <MediaImage src={t.image} alt="" className="tl-thumb" fit="cover" />}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </AppShell>
  );
}

function RefrechIcon() {
  return <RefreshCw size={14} />;
}

async function OverviewTab({ p, projectId }: { p: Awaited<ReturnType<typeof requirePrincipal>>; projectId: number }) {
  const { t } = await getT();
  const { rows, range } = await companyOverview(p, 30, projectId);
  const row = rows[0];
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  const recent = await db.report.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' }, take: 5 });
  const timeline = await db.timelineEvent.findMany({ where: { projectId }, orderBy: { date: 'desc' }, take: 3 });
  const fmt = { currency: project.currency, decimalSeparatorFormat: project.decimalSeparatorFormat };
  return (
    <div className="space-y-5">
      <div className="text-xs text-slate-500">
        {t('projects.last30vs', { start: range.start, end: range.end })}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {OVERVIEW_KPIS.map((k) => {
          const v = row?.kpis[k.id];
          return (
            <div key={k.id} className="card p-4">
              <div className="text-xs font-medium text-slate-500">{t(k.labelKey)}</div>
              {v ? (
                <>
                  <div className="mt-1 text-xl font-bold">{formatValue(v.value, k.format, fmt)}</div>
                  <div className="mt-1">
                    <Delta pct={v.change_pct} diff={k.goodUp ? 'positive_good' : 'neutral'} />
                  </div>
                </>
              ) : (
                <div className="mt-2 text-xs text-slate-300">{t('projects.notConnected')}</div>
              )}
            </div>
          );
        })}
      </div>
      {row?.anomalies.length ? (
        <div className="card border-amber-200 bg-amber-50/50 p-3 text-sm">
          {row.anomalies.map((a, i) => (
            <div key={i} className="flex items-center gap-1.5 text-amber-800">
              <AlertTriangle size={14} /> {a.metric} {a.direction === 'drop' ? 'dropped' : 'spiked'} {Math.abs(a.pctVsMean)}% vs its 14-day average
            </div>
          ))}
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <div className="mb-2 text-sm font-semibold">{t('projects.recent')}</div>
          {recent.length === 0 && <div className="text-sm text-slate-400">{t('common.nothingYet')}</div>}
          <ul className="space-y-1.5 text-sm">
            {recent.map((r) => (
              <li key={r.id}>
                <Link href={`/${r.kind === 'report' ? 'reports' : 'dashboards'}/${r.id}`} className="font-medium hover:text-brand">
                  {r.title}
                </Link>
                <span className="ml-2 text-xs text-slate-400">{r.kind}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-4">
          <div className="mb-2 text-sm font-semibold">{t('timeline.latest')}</div>
          {timeline.length === 0 && <div className="text-sm text-slate-400">{t('timeline.none')}</div>}
          <ul className="space-y-1.5 text-sm">
            {timeline.map((t) => (
              <li key={t.id}>
                <span className="mr-2 text-xs text-slate-400">{t.date}</span>
                {t.title}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

async function ReportList({ items, kind, projectId, write }: { items: any[]; kind: 'report' | 'dashboard'; projectId: number; write: boolean }) {
  const { t, locale } = await getT();
  return (
    <div className="space-y-4">
      {write && (
        <Link href={`/reports/new?project=${projectId}${kind === 'dashboard' ? '&kind=dashboard' : ''}`} className="btn-primary">
          <Plus size={14} /> New {kind}
        </Link>
      )}
      {items.length === 0 ? (
        <Empty title={`No ${kind}s yet`} hint={kind === 'report' ? t('reports.kindReport') : t('reports.kindDashboard')} />
      ) : (
        <div className="card divide-y divide-[var(--line)]">
          {items.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link href={`/${kind === 'report' ? 'reports' : 'dashboards'}/${r.id}`} className="font-medium hover:text-brand">
                  {r.title}
                </Link>
                <div className="text-xs text-slate-500">
                  {kind === 'dashboard' && r.preset !== 'custom' ? presetLabel(r.preset, locale) : `${r.startDate} → ${r.endDate}`} · {t('projects.viewsCount', { count: r.views })}
                </div>
              </div>
              {r.shareEnabled && (
                <a href={shareUrl(r.kind, r.shareToken)} target="_blank" className="btn" rel="noreferrer">
                  <ExternalLink size={13} /> {t('share.publicLink')}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type GoalsShare = { token: string | null; hasPassword: boolean; url: string | null; admin: boolean };
async function GoalsTab({ goals, write, options, projectId, fmt, share }: { goals: any[]; write: boolean; options: GoalOption[]; projectId: number; fmt: any; share: GoalsShare }) {
  const { t } = await getT();
  const progress = await Promise.all(goals.map((g) => goalProgress(g).catch(() => null)));
  const colors: Record<string, string> = { high: 'bg-emerald-500', ideal: 'bg-emerald-400', average: 'bg-amber-400', low: 'bg-red-500', no_data: 'bg-slate-300' };
  return (
    <div className="space-y-4">
      {goals.length === 0 ? (
        <Empty title={t('goals.noneTitle')} hint={t('goals.hint')} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {goals.map((g, i) => {
            const pr = progress[i];
            return (
              <div key={g.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{g.title}</div>
                    <div className="text-xs text-slate-500">
                      {g.frequency} · {g.direction === 'lower_better' ? 'stay under' : 'reach'} {formatValue(g.target, 'number', fmt)}
                    </div>
                    {Array.isArray(g.alertEmails) && g.alertEmails.length > 0 && <div className="text-xs text-slate-500" data-goal-alerts>Alerts to {g.alertEmails.join(', ')}</div>}
                  </div>
                  <span className={`badge text-white ${colors[pr?.situation ?? 'no_data']}`}>{pr?.situation ?? 'no_data'}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${colors[pr?.situation ?? 'no_data']}`} style={{ width: `${Math.min(100, pr?.progressPct ?? 0)}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-xs text-slate-500">
                  <span>
                    {pr?.current != null ? formatValue(pr.current, 'number', fmt) : '—'} ({pr?.progressPct ?? 0}%)
                  </span>
                  <span>
                    projected {pr?.estimatedEnd != null ? formatValue(pr.estimatedEnd, 'number', fmt) : '—'} · {pr?.daysRemaining}d left
                  </span>
                </div>
                {write && (
                  <form action={deleteGoalAction} className="mt-2 text-right">
                    <input type="hidden" name="id" value={g.id} />
                    <button className="text-xs text-slate-400 hover:text-red-500">{t('common.remove')}</button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
      {share.admin && (
        <div className="card p-4" data-goals-share={share.token ? 'on' : 'off'}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">{t('goals.shareControl')}</div>
              <div className="text-xs text-slate-500">{t('goals.shareHint')}</div>
            </div>
            {!share.token && (
              <form action={shareGoalsAction}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="op" value="share" />
                <button className="btn-primary">{t('goals.shareButton')}</button>
              </form>
            )}
          </div>
          {share.token && share.url && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <code className="block min-w-0 flex-1 break-all rounded bg-slate-50 px-2 py-1.5 text-xs">{share.url}</code>
                <CopyButton text={share.url} label={t('share.copyLink')} />
                <Link href={share.url} target="_blank" className="btn">
                  <ExternalLink size={14} /> {t('common.open')}
                </Link>
              </div>
              <div className="flex flex-wrap gap-2">
                <form action={shareGoalsAction} className="flex gap-2">
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="op" value="password" />
                  <input name="password" type="password" className="input" placeholder={share.hasPassword ? t('share.passwordSet') : t('share.optionalPassword')} />
                  <button className="btn">{t('common.save')}</button>
                </form>
                <form action={shareGoalsAction}>
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="op" value="stop" />
                  <ConfirmButton className="btn" message={t('goals.stopConfirm')}>
                    {t('goals.stopSharing')}
                  </ConfirmButton>
                </form>
              </div>
              <div className="text-xs text-slate-400">Embed: <code>{`<iframe src="${share.url}?embed=1" width="100%" height="700"></iframe>`}</code></div>
            </div>
          )}
        </div>
      )}
      {write && options.length > 0 && (
        <details className="card p-4" open={goals.length === 0}>
          <summary className="cursor-pointer text-sm font-semibold">{t('goals.new')}</summary>
          <div className="mt-4">
            <GoalForm projectId={projectId} options={options} action={saveGoalAction} />
          </div>
        </details>
      )}
    </div>
  );
}
