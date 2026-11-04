import Link from 'next/link';
import { Bell, Clock } from 'lucide-react';
import { db } from '@/lib/db';
import { requirePrincipal, type Principal } from '@/lib/auth';
import { logoutAction } from '@/app/actions/auth';
import { setUserLocaleAction } from '@/app/actions/app';
import { LOCALES, dictFor, t } from '@/lib/i18n';
import { I18nProvider } from './i18n-provider';
import { APP_NAMESPACES } from '@/lib/i18n/namespaces';

/** The namespaces client components of the app read through useT(); e-mails, public pages and the signed-out pages ship their own. */
import { setServerLocale } from '@/lib/i18n/server';
import { NavButton, NavLink } from './nav-link';
import { PillNav, SideRail, TabBar } from './top-nav';
import { navModel } from './nav-groups';
import { Wordmark } from './brand-marks';
import { UserAvatar } from './avatar';
import { Providers } from './providers';
import { SearchDialog } from './search-dialog';

// The frame (docs/DESIGN.md › Ruler glass pass, design-system.md §6.1): a top bar with the Ruler wordmark, the glass pill
// menu of the daily places, notifications and the account; a rail of round icon buttons for the secondary places; on
// phones a floating glass tab bar. Everything sits on the ground (grey with one glow), drawn once behind the page.

/** The agency's mark in the top bar: the Ruler wordmark (Figma), never retyped. */
export function BrandMark({ className = '' }: { className?: string }) {
  return <Wordmark height={18} className={className} />;
}

export async function AppShell({ children, active }: { children: React.ReactNode; active?: string }) {
  const p: Principal = await requirePrincipal();
  const company = await db.company.findUniqueOrThrow({ where: { id: p.companyId } });
  const unread = await db.notification.count({ where: { companyId: p.companyId, readAt: null } });
  const locale = p.locale ?? 'en';
  setServerLocale(locale);
  const nav = navModel(locale, p.role);
  const canSettings = p.role !== 'client' && p.role !== 'viewer';
  const settings = canSettings ? nav.settings : undefined;
  const moreItems = [...nav.secondary, ...(settings ? [settings] : [])];
  return (
    <Providers>
    <I18nProvider locale={locale} dict={dictFor(locale, APP_NAMESPACES)}>
      <div className="frame ground">
        <a href="#main" className="skip-link">
          {t(locale, 'common.skipToContent')}
        </a>
        <header className="topbar no-print">
          <Link href={p.role === 'client' ? '/dashboards' : '/overview'} className="topbar-brand" aria-label={t(locale, 'common.brandOverview', { name: company.name })}>
            <BrandMark />
            <span className="topbar-ws truncate">{company.name}</span>
          </Link>
          <PillNav items={nav.daily} active={active} label={t(locale, 'nav.main')} />
          <div className="topbar-right">
            <SearchDialog
              labels={{
                open: t(locale, 'search.open'),
                placeholder: t(locale, 'search.placeholder'),
                close: t(locale, 'common.close'),
                nothing: t(locale, 'search.nothing'),
                hint: t(locale, 'search.hint'),
                connectItem: t(locale, 'search.connectItem'),
                groups: { clients: t(locale, 'search.clients'), reports: t(locale, 'search.reports'), dashboards: t(locale, 'search.dashboards'), accounts: t(locale, 'search.accounts'), connect: t(locale, 'search.connect') },
              }}
            />
            <Link href="/notifications" className={`icon-btn ${active === '/notifications' ? 'is-active' : ''}`} aria-label={unread > 0 ? t(locale, 'common.notificationsUnread', { count: unread }) : t(locale, 'common.notifications')}>
              <Bell size={18} strokeWidth={1.5} aria-hidden="true" />
              {unread > 0 && <span className="bell-dot" aria-hidden="true" />}
            </Link>
            <details className="umenu">
              <summary className="umenu-button" aria-label={t(locale, 'common.accountMenu', { name: p.name, role: p.role })}>
                <UserAvatar seed={p.email ?? p.name} size={40} label={t(locale, 'common.avatarOf', { name: p.name })} />
              </summary>
              <div className="umenu-panel overlay">
                <div className="flex items-center gap-3 px-3 py-3">
                  <UserAvatar seed={p.email ?? p.name} size={40} label={t(locale, 'common.avatarOf', { name: p.name })} animate />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{p.name}</div>
                    <div className="truncate text-xs text-ink-3">
                      {p.role}
                      {p.email ? `, ${p.email}` : ''}
                    </div>
                  </div>
                </div>
                <div className="border-t border-[var(--line)] p-1.5">
                  <NavLink href="/notifications" label={t(locale, 'common.notifications')} icon="bell" />
                  {canSettings && <NavLink href="/settings" label={t(locale, 'common.settings')} icon="gear" />}
                  <form action={logoutAction}>
                    <NavButton label={t(locale, 'common.signOut')} icon="exit" />
                  </form>
                  <form action={setUserLocaleAction} className="flex items-center gap-1 px-3 py-1.5 text-xs text-ink-3" data-locale-switch>
                    <span className="mr-1">{t(locale, 'common.language')}:</span>
                    {LOCALES.map((l) => (
                      <button key={l} name="locale" value={l} className={`lang-chip ${locale === l ? 'is-active' : ''}`} aria-pressed={locale === l} title={t(locale, l === 'en' ? 'common.english' : 'common.greek')}>
                        {t(locale, l === 'en' ? 'common.english' : 'common.greek')}
                      </button>
                    ))}
                  </form>
                </div>
              </div>
            </details>
          </div>
        </header>
        <div className="frame-body">
          <SideRail items={nav.secondary} settings={settings} active={active} label={t(locale, 'nav.tools')} />
          <main id="main" className="frame-main">
            <div className="frame-content">{children}</div>
          </main>
        </div>
        <TabBar daily={nav.daily} more={moreItems} active={active} labels={{ nav: t(locale, 'nav.main'), more: t(locale, 'nav.more') }} />
      </div>
    </I18nProvider>
    </Providers>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="page-sub">{subtitle}</div>}
      </div>
      <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <Clock size={22} strokeWidth={1.5} className="text-ink-3" aria-hidden="true" />
      <div className="display text-lg font-medium">{title}</div>
      {hint && <div className="max-w-md text-sm text-ink-2">{hint}</div>}
      {action}
    </div>
  );
}

export function Tabs({ tabs, current, base }: { tabs: { id: string; label: string; count?: number }[]; current: string; base: string }) {
  return (
    <div className="no-print mb-6 overflow-x-auto overflow-y-hidden pb-1">
      <div className="segments">
        {tabs.map((t) => {
          const on = t.id === current;
          return (
            <Link key={t.id} href={`${base}${t.id === tabs[0].id ? '' : `?tab=${t.id}`}`} aria-current={on ? 'page' : undefined} className={on ? 'is-active' : undefined}>
              {t.label}
              {t.count != null && <span className="seg-count num">{t.count}</span>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
