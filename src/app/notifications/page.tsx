import Link from 'next/link';
import { getT } from '@/lib/i18n/server';
import { AppShell, Empty, PageHeader } from '@/components/shell';
import { markNotificationsReadAction } from '@/app/actions/app';
import { requirePrincipal } from '@/lib/auth';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const { t } = await getT();
  const p = await requirePrincipal();
  const items = await db.notification.findMany({ where: { companyId: p.companyId }, orderBy: { createdAt: 'desc' }, take: 100 });
  return (
    <AppShell>
      <PageHeader
        title={t('common.notifications')}
        subtitle={t('notifications.subtitle')}
        actions={
          <form action={markNotificationsReadAction}>
            <button className="btn">{t('notifications.markAllRead')}</button>
          </form>
        }
      />
      {items.length === 0 ? (
        <Empty title={t('common.nothingYetTitle')} hint={t('notifications.hint')} />
      ) : (
        <div className="card divide-y divide-[var(--line)]">
          {items.map((n) => (
            <div key={n.id} className={`flex items-start gap-3 px-4 py-3 ${n.readAt ? '' : 'bg-brand-soft/40'}`}>
              {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />}
              <div className="min-w-0 flex-1">
                {n.link ? (
                  <Link href={n.link} className="font-medium hover:text-brand">
                    {n.title}
                  </Link>
                ) : (
                  <div className="font-medium">{n.title}</div>
                )}
                {n.body && <div className="text-sm text-slate-500">{n.body}</div>}
              </div>
              <div className="text-xs text-slate-400">{n.createdAt.toISOString().slice(0, 16).replace('T', ' ')}</div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
