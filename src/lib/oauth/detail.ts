// The account pickers show what each provider says about an account (its id, currency, status, the manager or Page
// it is reached through). providers.ts writes that in English API words; this turns each part into a label in the
// reader's language. Unknown parts pass through unchanged.
type T = (key: string, vars?: Record<string, string | number>) => string;

const WORD: Record<string, string> = {
  siteOwner: 'connect.dOwner',
  siteFullUser: 'connect.dFullUser',
  siteRestrictedUser: 'connect.dRestrictedUser',
  active: 'connect.dActive',
  disabled: 'connect.dDisabled',
  unsettled: 'connect.dUnsettled',
  'pending review': 'connect.dPendingReview',
  'grace period': 'connect.dGracePeriod',
  closed: 'connect.dClosed',
};

export function detailParts(detail: string | undefined, t: T): string[] {
  if (!detail) return [];
  return detail
    .split(' · ')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      if (WORD[part]) return t(WORD[part]);
      let m = /^via Page (.+)$/.exec(part);
      if (m) return t('connect.dViaPage', { name: m[1] });
      m = /^via (.+)$/.exec(part);
      if (m) return t('connect.dViaManager', { name: m[1] });
      m = /^property (\d+)$/.exec(part);
      if (m) return t('connect.dProperty', { id: m[1] });
      return part;
    });
}
