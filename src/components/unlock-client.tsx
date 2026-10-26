'use client';

import { useActionState } from 'react';
import { unlockShareAction } from '@/app/actions/public';

export function UnlockClient({ token, kind, labels, lang, embed }: { token: string; kind: string; labels?: { password?: string; checking?: string; view?: string }; /** kept across the unlock redirect */ lang?: string; embed?: boolean }) {
  const [state, action, pending] = useActionState(unlockShareAction as any, null as any);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="kind" value={kind} />
      {lang && <input type="hidden" name="lang" value={lang} />}
      {embed && <input type="hidden" name="embed" value="1" />}
      <input name="password" type="password" className="input" placeholder={labels?.password ?? 'Password'} autoFocus required />
      {state?.error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? (labels?.checking ?? 'Checking…') : (labels?.view ?? 'View')}
      </button>
    </form>
  );
}
