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
          <input id={f.name} name={f.name} type={f.type ?? 'text'} placeholder={f.placeholder} autoComplete={f.autoComplete} className="input input-lg" required />
        </div>
      ))}
      {state?.error && (
        <div className="form-error" role="alert">
          {state.error}
        </div>
      )}
      <button className="btn-primary btn-lg w-full" disabled={pending}>
        {pending ? (pendingLabel ?? '…') : submit}
      </button>
    </form>
  );
}
