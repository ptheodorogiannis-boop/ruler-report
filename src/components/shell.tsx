import Link from 'next/link';
import { Clock } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePrincipal, type Principal } from '@/lib/auth';
import { logoutAction } from '@/app/actions/auth';
import { setUserLocaleAction } from '@/app/actions/app';
import { LOCALES, dictFor, t } from '@/lib/i18n';
import { I18nProvider } from './i18n-provider';

/** The namespaces client components of the app read through useT(); e-mails, public pages and the signed-out pages ship their own. */
const APP_NAMESPACES = ['analysis', 'automations', 'campaigns', 'common', 'connect', 'editor', 'goals', 'health', 'integrations', 'look', 'media', 'metrics', 'nav', 'notifications', 'overview', 'presets', 'projects', 'public', 'reports', 'settings', 'share', 'templates', 'timeline', 'tones', 'wizard'];
import { setServerLocale } from '@/lib/i18n/server';
import { NavButton, NavLink } from './nav-link';
import { TopNav } from './top-nav';
import { navGroups } from './nav-groups';
import { UserAvatar } from './avatar';
import { Providers } from './providers';

// The instrument frame (docs/DESIGN.md › Structure pass): one top rail carrying the slide-rule navigation, a scroll
// ruler down the left edge, and the document in the middle. No sidebar column.

/** The mark: a square with the agency initial and three ruler ticks — the only place the brand draws attention to itself. */
export function BrandMark({ initial = 'R', className = '' }: { initial?: string; className?: string }) {
  return (
    <span className={`relative inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand text-white ${className}`} aria-hidden="true">
      <span className="display text-lg font-semibold leading-none">{initial}</span>
      <svg className="absolute inset-x-0 bottom-0 h-2 w-full" viewBox="0 0 36 8" fill="none" stroke="currentColor" strokeOpacity="0.8">
        <path d="M6 8V4M12 8V6M18 8V3M24 8V6M30 8V4" strokeWidth="1.2" />
      </svg>
    </span>
  );
}

export async function AppShell({ children, active }: { children: React.ReactNode; active?: string }) {
  const p: Principal = await requirePrincipal();
  const company = await db.company.findUniqueOrThrow({ where: { id: p.companyId } });
  const unread = await db.notification.count({ where: { companyId: p.companyId, readAt: null } });
  const locale = p.locale ?? 'en';
  setServerLocale(locale);
  const groups = navGroups(locale, p.role);
  const canSettings = p.role !== 'client' && p.role !== 'viewer';
  return (
    <Providers>
    <I18nProvider locale={locale} dict={dictFor(locale, APP_NAMESPACES)}>
      <div className="frame" style={{ ['--brand' as any]: company.brandColor, ['--brand-soft' as any]: company.brandColor + '1a' }}>
        <a href="#main" className="skip-link">
          {t(locale, 'common.skipToContent')}
        </a>
        <header className="rail no-print">
          <div className="rail-inner">
            <Link href="/overview" className="rail-brand" aria-label={t(locale, 'common.brandOverview', { name: company.name })}>
              <BrandMark initial={company.name.slice(0, 1)} />
              <span className="display truncate text-[15px] font-semibold">{company.name}</span>
            </Link>
            <TopNav groups={groups} active={active} />
            <div className="rail-right">
              <Link href="/notifications" className={`rail-icon ${active === '/notifications' ? 'is-active' : ''}`} aria-label={unread > 0 ? t(locale, 'common.notificationsUnread', { count: unread }) : t(locale, 'common.notifications')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
                  <path d="M10 21a2 2 0 0 0 4 0" />
                </svg>
                {unread > 0 && <span className="rail-badge num">{unread}</span>}
              </Link>
              <details className="umenu">
                <summary className="umenu-button" aria-label={t(locale, 'common.accountMenu', { name: p.name, role: p.role })}>
                  <UserAvatar seed={p.email ?? p.name} size={32} label={t(locale, 'common.avatarOf', { name: p.name })} />
                </summary>
                <div className="umenu-panel card">
                  <div className="flex items-center gap-3 px-3 py-3">
                    <UserAvatar seed={p.email ?? p.name} size={40} label={t(locale, 'common.avatarOf', { name: p.name })} animate />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{p.name}</div>
                      <div className="truncate text-[11px] text-ink-3">
                        {p.role}
                        {p.email ? ` · ${p.email}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-[var(--line)] p-1.5">
                    <NavLink href="/notifications" label={t(locale, 'common.notifications')} icon="bell" />
                    {canSettings && <NavLink href="/settings" label={t(locale, 'common.settings')} icon="gear" />}
                    <form action={logoutAction}>
                      <NavButton label={t(locale, 'common.signOut')} icon="exit" />
                    </form>
                    <form action={setUserLocaleAction} className="flex items-center gap-1 px-3 py-1.5 text-[11px] text-ink-3" data-locale-switch>
                      <span className="mr-1">{t(locale, 'common.language')}:</span>
                      {LOCALES.map((l) => (
                        <button key={l} name="locale" value={l} className={`rounded px-1.5 py-0.5 uppercase ${locale === l ? 'bg-brand-soft font-semibold text-brand' : 'hover:text-ink'}`} aria-pressed={locale === l} title={t(locale, l === 'en' ? 'common.english' : 'common.greek')}>
                          {l}
                        </button>
                      ))}
                    </form>
                  </div>
                </div>
              </details>
            </div>
          </div>
        </header>
          <main id="main" className="frame-main">
          <div className="frame-content">{children}</div>
        </main>
      </div>
    </I18nProvider>
    </Providers>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="display text-[clamp(26px,3vw,34px)] font-semibold leading-tight tracking-[-0.015em]">{title}</h1>
        {subtitle && <div className="mt-1.5 text-sm text-ink-2">{subtitle}</div>}
      </div>
      <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <Clock size={22} className="text-ink-3" aria-hidden="true" />
      <div className="display text-lg font-semibold">{title}</div>
      {hint && <div className="max-w-md text-sm text-ink-2">{hint}</div>}
      {action}
    </div>
  );
}

export function Tabs({ tabs, current, base }: { tabs: { id: string; label: string; count?: number }[]; current: string; base: string }) {
  return (
    <div className="no-print mb-5 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-[var(--line)]">
      {tabs.map((t) => {
        const on = t.id === current;
        return (
          <Link key={t.id} href={`${base}${t.id === tabs[0].id ? '' : `?tab=${t.id}`}`} aria-current={on ? 'page' : undefined} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${on ? 'border-brand text-brand' : 'border-transparent text-ink-2 hover:text-ink'}`}>
            {t.label}
            {t.count != null && <span className={`num ml-1.5 rounded-full px-1.5 text-[11px] ${on ? 'bg-brand-soft text-brand' : 'bg-[var(--paper)] text-ink-3'}`}>{t.count}</span>}
          </Link>
        );
      })}
    </div>
  );
}
