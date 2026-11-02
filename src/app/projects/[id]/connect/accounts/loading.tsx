// While the accounts-found page asks each network for its accounts (several API calls, a second or two), the
// shape of what is coming: a title, the search field and two network groups.
import { AppShell } from '@/components/shell';
import { getT } from '@/lib/i18n/server';

const bar = 'rounded-md bg-[var(--line)]';

export default async function Loading() {
  const { t } = await getT();
  return (
    <AppShell active="/projects">
      <div className="mx-auto max-w-[720px] pt-2" aria-busy="true" aria-live="polite">
        <span className="sr-only">{t('connect.loadingAccounts')}</span>
        <div className={`${bar} h-8 w-72`} />
        <div className={`${bar} mt-4 h-4 w-[28rem] max-w-full`} />
        <div className="mt-6 h-11 rounded-lg border border-[var(--line)] bg-[var(--card)]" />
        {[0, 1].map((g) => (
          <div key={g} className="mt-8">
            <div className="flex items-center gap-3">
              <div className={`${bar} h-8 w-8 rounded-lg`} />
              <div className={`${bar} h-4 w-32`} />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[68px] rounded-lg border border-[var(--line)] bg-[var(--card)]" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
