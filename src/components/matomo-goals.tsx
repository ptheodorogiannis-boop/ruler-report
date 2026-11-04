// The Goals list of a Matomo account (docs/superpowers/specs/2026-11-04-ads-previews-sources-matomo-design.md §3): each goal's
// ID, its name in Matomo and "Show as", the name the picker, widget titles, client link, PDF and AI analysis use.
import { saveGoalNamesAction } from '@/app/actions/app';
import { ActionForm } from '@/components/action-form';
import { GOAL_NAME_MAX, type MatomoGoalConfig } from '@/lib/catalog/matomo-goals';
import { getT } from '@/lib/i18n/server';

export async function MatomoGoals({ integrationId, name, config }: { integrationId: number; name: string; config: MatomoGoalConfig | null }) {
  const { t } = await getT();
  const goals = config?.goals ?? [];
  const head = (
    <>
      <div className="label">{t('integrations.goalsTitle', { name })}</div>
      <p className="max-w-[72ch] text-xs leading-4 text-ink-3">{t('integrations.goalsHint')}</p>
    </>
  );
  if (!goals.length)
    return (
      <div className="card space-y-3 p-4" data-goals-editor>
        {head}
        <p className="text-sm text-ink-2">{t('integrations.goalsNone')}</p>
      </div>
    );
  return (
    <ActionForm action={saveGoalNamesAction} submit={t('integrations.goalsSave')} successText={t('integrations.goalsSaved')} className="card space-y-3 p-4">
      <input type="hidden" name="integrationId" value={integrationId} />
      {head}
      <table className="w-full text-sm" data-goals-editor>
        <thead>
          <tr className="text-left text-xs text-ink-3">
            <th className="w-12 py-2 font-medium">{t('integrations.goalId')}</th>
            <th className="py-2 pr-4 font-medium">{t('integrations.goalMatomoName')}</th>
            <th className="py-2 font-medium">{t('integrations.goalShowAs')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--line)]">
          {goals.map((g) => (
            <tr key={g.id} data-goal={g.id}>
              <td className="num py-2 text-ink-3">{g.id}</td>
              <td className="py-2 pr-4">{g.name}</td>
              <td className="py-2">
                <input name={`goal_${g.id}`} className="input" defaultValue={config?.goalNames?.[g.id] ?? ''} placeholder={g.name} maxLength={GOAL_NAME_MAX} aria-label={`${t('integrations.goalShowAs')}: ${g.name}`} autoComplete="off" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ActionForm>
  );
}
