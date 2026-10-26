'use client';

import { useActionState } from 'react';

type Field = { name: string; label: string; type?: string; placeholder?: string; autoComplete?: string };

export function AuthForm({ action, fields, submit, pending: pendingLabel }: { action: (prev: unknown, fd: FormData) => Promise<{ error?: string } | void>; fields: Field[]; submit: string; /** label while submitting */ pending?: string }) {
  const [state, formAction, pending] = useActionState(action as any, null as any);
  return (
    <form action={formAction} className="space-y-4">
      {fields.map((f) => (
        <div key={f.name}>
          <label className="label" htmlFor={f.name}>
            {f.label}
          </label>
          <input id={f.name} name={f.name} type={f.type ?? 'text'} placeholder={f.placeholder} autoComplete={f.autoComplete} className="input" required />
        </div>
      ))}
      {state?.error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? (pendingLabel ?? '…') : submit}
      </button>
    </form>
  );
}
