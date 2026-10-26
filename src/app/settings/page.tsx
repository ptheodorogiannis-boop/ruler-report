import Link from 'next/link';
import { getT } from '@/lib/i18n/server';
import { notFound } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { AppShell, PageHeader, Tabs } from '@/components/shell';
import { ActionForm, ConfirmButton } from '@/components/action-form';
import { createTokenAction, deleteWebhookAction, inviteUserAction, removeUserAction, revokeTokenAction, saveBrandingAction, saveWebhookAction, testWebhookAction, toggleWebhookAction } from '@/app/actions/app';
import { canAdmin, requirePrincipal } from '@/lib/auth';
import { db } from '@/lib/db';
import { WEBHOOK_EVENTS, WEBHOOK_SOURCES } from '@/lib/services/webhooks';
import { smtpConfigured } from '@/lib/services/messaging';
import { aiConfigured } from '@/lib/ai/insights';
import { UserAvatar } from '@/components/avatar';

export const dynamic = 'force-dynamic';

const TABS = [
  { id: 'branding', label: 'settings.tabBranding' },
  { id: 'team', label: 'settings.tabTeam' },
  { id: 'api', label: 'settings.tabTokens' },
  { id: 'webhooks', label: 'settings.tabWebhooks' },
  { id: 'outbox', label: 'settings.tabOutbox' },
  { id: 'system', label: 'settings.tabSystem' },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { t } = await getT();
  const p = await requirePrincipal();
  if (!['owner', 'admin', 'editor'].includes(p.role)) notFound();
  const sp = await searchParams;
  const tab = TABS.some((tok) => tok.id === sp.tab) ? sp.tab! : 'branding';
  const admin = canAdmin(p);
  const company = await db.company.findUniqueOrThrow({ where: { id: p.companyId } });

  return (
    <AppShell>
      <PageHeader title={t('common.settings')} subtitle={company.name} />
      <Tabs tabs={TABS.map((x) => ({ ...x, label: t(x.label) }))} current={tab} base="/settings" />

      {tab === 'branding' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="card p-5 lg:col-span-2">
            {!admin && <div className="mb-3 text-sm text-amber-700">{t('settings.adminsOnly')}</div>}
            <ActionForm action={saveBrandingAction} submit={t('settings.saveBranding')} successText={t('settings.brandingSaved')} className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="label">{t('settings.agencyName')}</label>
                <input name="name" defaultValue={company.name} className="input" />
              </div>
              <div>
                <label className="label">{t('settings.logoUrl')}</label>
                <input name="logo" defaultValue={company.logo ?? ''} className="input" placeholder="https://…/logo.png" />
              </div>
              <div>
                <label className="label">{t('settings.brandColour')}</label>
                <input name="brandColor" type="color" defaultValue={company.brandColor} className="h-9 w-full cursor-pointer rounded-lg border border-[var(--line)]" />
              </div>
              <div>
                <label className="label">{t('look.accent')}</label>
                <input name="accentColor" type="color" defaultValue={company.accentColor} className="h-9 w-full cursor-pointer rounded-lg border border-[var(--line)]" />
              </div>
              <div>
                <label className="label">{t('settings.customDomain')}</label>
                <input name="customDomain" defaultValue={company.customDomain ?? ''} className="input" placeholder="reports.youragency.com" />
              </div>
              <div>
                <label className="label">{t('settings.emailSender')}</label>
                <input name="emailFromName" defaultValue={company.emailFromName ?? ''} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="company-locale">{t('common.language')}</label>
                <select id="company-locale" name="locale" defaultValue={company.locale} className="input" data-company-locale>
                  <option value="en">English</option>
                  <option value="el">Ελληνικά</option>
                </select>
                <div className="mt-1 text-[11px] text-ink-3">{t('settings.languageHint')}</div>
              </div>
              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <input type="checkbox" name="hidePoweredBy" defaultChecked={company.hidePoweredBy} /> {t('settings.hidePoweredBy')}
              </label>
              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <input type="checkbox" name="showDataNotes" defaultChecked={company.showDataNotes} /> {t('settings.showDataNotes')}
              </label>
            </ActionForm>
          </div>
          <div className="card p-5 text-sm text-slate-600">
            <div className="mb-2 font-semibold text-slate-900">{t('settings.whiteLabelHow')}</div>
            <ul className="list-disc space-y-1 pl-5">
              <li>{t('settings.wlLinks')}</li>
              <li>{t('settings.wlDomain')}</li>
              <li>{t('settings.wlEmbed')}</li>
            </ul>
            <div className="mt-3 text-xs text-slate-400">{t('settings.wlNote')}</div>
          </div>
        </div>
      )}

      {tab === 'team' && <TeamTab companyId={p.companyId} me={p.userId} admin={admin} />}
      {tab === 'api' && <ApiTab companyId={p.companyId} admin={admin} />}
      {tab === 'webhooks' && <WebhooksTab companyId={p.companyId} />}
      {tab === 'outbox' && <OutboxTab companyId={p.companyId} />}
      {tab === 'system' && (
        <div className="grid gap-3 md:grid-cols-2">
          {[
            [t('settings.sysAi'), aiConfigured(), t('settings.sysAiHint')],
            [t('settings.sysEmail'), smtpConfigured(), t('settings.sysEmailHint')],
            [t('settings.sysGoogle'), !!process.env.GOOGLE_CLIENT_ID, t('settings.sysGoogleHint')],
            [t('settings.sysMeta'), !!process.env.META_APP_ID, t('settings.sysMetaHint')],
            [t('settings.sysScheduler'), process.env.ENABLE_SCHEDULER !== '0', t('settings.sysSchedulerHint')],
          ].map(([l, on, h]) => (
            <div key={String(l)} className="card p-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">{l as string}</div>
                <span className={`badge ${on ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{on ? t('settings.configured') : t('settings.notSet')}</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">{h as string}</div>
            </div>
          ))}
          <div className="card p-4 text-xs text-slate-500 md:col-span-2">
            {t('settings.appUrl')}: <code>{process.env.APP_URL}</code> · Node {process.version}
          </div>
        </div>
      )}
    </AppShell>
  );
}

async function TeamTab({ companyId, me, admin }: { companyId: number; me: number | null; admin: boolean }) {
  const { t } = await getT();
  const [users, projects] = await Promise.all([db.user.findMany({ where: { companyId }, include: { access: { include: { project: true } } }, orderBy: { createdAt: 'asc' } }), db.project.findMany({ where: { companyId }, orderBy: { name: 'asc' } })]);
  return (
    <div className="space-y-5">
      <div className="card divide-y divide-[var(--line)]">
        {users.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <UserAvatar seed={u.email} size={36} label={`${u.name}'s avatar`} />
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {u.name} {u.id === me && <span className="text-xs text-ink-3">(you)</span>}
              </div>
              <div className="text-xs text-slate-500">
                {u.email}
                {u.access.length > 0 && ` · limited to: ${u.access.map((a) => a.project.name).join(', ')}`}
              </div>
            </div>
            <span className="badge bg-slate-100 text-slate-600">{u.role}</span>
            {admin && u.role !== 'owner' && u.id !== me && (
              <form action={removeUserAction}>
                <input type="hidden" name="id" value={u.id} />
                <ConfirmButton message={`Remove ${u.email}?`}>
                  <Trash2 size={14} />
                </ConfirmButton>
              </form>
            )}
          </div>
        ))}
      </div>
      {admin && (
        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-semibold">{t('settings.addUser')}</summary>
          <ActionForm action={inviteUserAction} submit={t('settings.createUser')} successText={t('settings.userCreated')} className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <label className="label">{t('common.name')}</label>
              <input name="name" className="input" required />
            </div>
            <div>
              <label className="label">{t('auth.email')}</label>
              <input name="email" type="email" className="input" required />
            </div>
            <div>
              <label className="label">{t('settings.tempPassword')}</label>
              <input name="password" type="password" className="input" required minLength={8} />
            </div>
            <div>
              <label className="label">{t('settings.role')}</label>
              <select name="role" className="input" defaultValue="editor">
                <option value="admin">{t('settings.roleAdmin')}</option>
                <option value="editor">{t('settings.roleEditor')}</option>
                <option value="viewer">{t('settings.roleViewer')}</option>
                <option value="client">{t('settings.roleClient')}</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <div className="label">{t('settings.limitProjects')}</div>
              <div className="grid gap-1 md:grid-cols-3">
                {projects.map((pr) => (
                  <label key={pr.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="projectIds" value={pr.id} /> {pr.name}
                  </label>
                ))}
              </div>
            </div>
          </ActionForm>
        </details>
      )}
    </div>
  );
}

async function ApiTab({ companyId, admin }: { companyId: number; admin: boolean }) {
  const { t } = await getT();
  const tokens = await db.apiToken.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } });
  return (
    <div className="space-y-5">
      <div className="card divide-y divide-[var(--line)]">
        {tokens.length === 0 && <div className="px-4 py-6 text-center text-sm text-slate-400">{t('settings.noTokens')}</div>}
        {tokens.map((tok) => (
          <div key={tok.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1">
              <div className="font-medium">{tok.name}</div>
              <div className="text-xs text-slate-500">
                <code>{tok.prefix}…</code> · created {tok.createdAt.toISOString().slice(0, 10)} · {tok.lastUsedAt ? `last used ${tok.lastUsedAt.toISOString().slice(0, 10)}` : 'never used'}
              </div>
            </div>
            {admin && (
              <form action={revokeTokenAction}>
                <input type="hidden" name="id" value={tok.id} />
                <ConfirmButton message={t('settings.revokeConfirm')}>{t('settings.revoke')}</ConfirmButton>
              </form>
            )}
          </div>
        ))}
      </div>
      {admin && (
        <ActionForm action={createTokenAction} submit={t('settings.createToken')} className="card flex items-end gap-3 p-4">
          <div className="flex-1">
            <label className="label">{t('settings.tokenName')}</label>
            <input name="name" className="input" placeholder="Looker Studio sync" />
          </div>
        </ActionForm>
      )}
      <div className="text-sm text-slate-500">
        Use as <code>Authorization: Bearer rr_…</code> against <code>/api/v2</code>. Docs: <Link href="/api-docs" className="font-semibold text-brand">API & MCP</Link>.
      </div>
    </div>
  );
}

async function WebhooksTab({ companyId }: { companyId: number }) {
  const { t } = await getT();
  const [hooks, projects] = await Promise.all([db.webhook.findMany({ where: { companyId }, include: { deliveries: { orderBy: { createdAt: 'desc' }, take: 3 }, project: true }, orderBy: { createdAt: 'desc' } }), db.project.findMany({ where: { companyId }, orderBy: { name: 'asc' } })]);
  return (
    <div className="space-y-5">
      <div className="card divide-y divide-[var(--line)]">
        {hooks.length === 0 && <div className="px-4 py-6 text-center text-sm text-slate-400">{t('settings.noWebhooks')}</div>}
        {hooks.map((h) => (
          <div key={h.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs">{h.url}</div>
                <div className="text-xs text-slate-500">
                  {h.eventType} · {h.source} · {h.project ? h.project.name : 'all projects'} · secret <code>{h.secret.slice(0, 10)}…</code>
                </div>
              </div>
              <span className={`badge ${h.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{h.status}</span>
              <div className="flex gap-1">
                <form action={testWebhookAction}>
                  <input type="hidden" name="id" value={h.id} />
                  <button className="btn">{t('settings.sendTest')}</button>
                </form>
                <form action={toggleWebhookAction}>
                  <input type="hidden" name="id" value={h.id} />
                  <button className="btn">{h.status === 'active' ? t('projects.pause') : t('settings.resume')}</button>
                </form>
                <form action={deleteWebhookAction}>
                  <input type="hidden" name="id" value={h.id} />
                  <ConfirmButton message={t('settings.deleteWebhookConfirm')}>
                    <Trash2 size={14} />
                  </ConfirmButton>
                </form>
              </div>
            </div>
            {h.deliveries.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-slate-400">
                {h.deliveries.map((d) => (
                  <span key={d.id}>
                    {d.createdAt.toISOString().slice(0, 16).replace('T', ' ')} · {d.event} ·{' '}
                    <span className={d.error ? 'text-red-600' : 'text-emerald-600'}>{d.error ?? d.statusCode}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <ActionForm action={saveWebhookAction} submit={t('settings.addWebhook')} className="card grid gap-3 p-4 md:grid-cols-4">
        <div className="md:col-span-2">
          <label className="label">{t('settings.url')}</label>
          <input name="url" type="url" className="input" required placeholder="https://hook.make.com/…  (or Slack / Teams / Discord incoming webhook)" />
        </div>
        <div>
          <label className="label">{t('settings.event')}</label>
          <select name="eventType" className="input">
            {WEBHOOK_EVENTS.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t('settings.sourceFormat')}</label>
          <select name="source" className="input">
            {WEBHOOK_SOURCES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t('settings.scope')}</label>
          <select name="projectId" className="input">
            <option value="">{t('settings.allProjects')}</option>
            {projects.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.name}
              </option>
            ))}
          </select>
        </div>
        <div className="text-xs text-slate-500 md:col-span-3">
          Payloads are signed: <code>X-RulerReports-Signature: sha256=HMAC(secret, body)</code>. Slack / Teams / Discord sources receive a chat-formatted message instead of JSON.
        </div>
      </ActionForm>
    </div>
  );
}

async function OutboxTab({ companyId }: { companyId: number }) {
  const { t } = await getT();
  const items = await db.outbox.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 50 });
  return (
    <div className="space-y-3">
      <div className="text-sm text-slate-500">{smtpConfigured() ? t('settings.smtpOn') : t('settings.smtpOff')}</div>
      <div className="card divide-y divide-[var(--line)]">
        {items.length === 0 && <div className="px-4 py-6 text-center text-sm text-slate-400">{t('settings.nothingQueued')}</div>}
        {items.map((m) => (
          <details key={m.id} className="px-4 py-3">
            <summary className="flex cursor-pointer items-center gap-3 text-sm">
              <span className="flex-1 font-medium">{m.subject}</span>
              <span className="text-xs text-slate-500">{m.toAddr}</span>
              <span className={`badge ${m.status === 'sent' ? 'bg-emerald-50 text-emerald-700' : m.status === 'error' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{m.status}</span>
            </summary>
            {m.error && <div className="mt-2 text-xs text-slate-500">{m.error}</div>}
            <iframe sandbox="" srcDoc={m.body} title={m.subject} className="mt-2 h-80 w-full rounded-lg border border-[var(--line)] bg-white" />
          </details>
        ))}
      </div>
    </div>
  );
}
