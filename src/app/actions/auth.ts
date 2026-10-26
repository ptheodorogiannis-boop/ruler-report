'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { checkPassword, createSession, destroySession, hashPassword } from '@/lib/auth';
import { db } from '@/lib/db';
import { PLATFORM_TEMPLATES } from '@/lib/templates/defaults';

export async function loginAction(_: unknown, fd: FormData) {
  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  const password = String(fd.get('password') ?? '');
  const u = await db.user.findUnique({ where: { email } });
  if (!u || !(await checkPassword(password, u.passwordHash))) return { error: 'Invalid email or password.' };
  await createSession(u.id);
  redirect(u.role === 'client' ? '/dashboards' : '/overview');
}

export async function signupAction(_: unknown, fd: FormData) {
  const r = z
    .object({ company: z.string().min(2), name: z.string().min(2), email: z.string().email(), password: z.string().min(8, 'Password must be at least 8 characters') })
    .safeParse({ company: fd.get('company'), name: fd.get('name'), email: String(fd.get('email') ?? '').toLowerCase(), password: fd.get('password') });
  if (!r.success) return { error: r.error.issues[0].message };
  if (await db.user.findUnique({ where: { email: r.data.email } })) return { error: 'An account with this email already exists.' };
  const company = await db.company.create({ data: { name: r.data.company, type: 'agency' } });
  const user = await db.user.create({ data: { companyId: company.id, email: r.data.email, name: r.data.name, passwordHash: await hashPassword(r.data.password), role: 'owner' } });
  // make sure platform templates exist (first run on an empty DB)
  if ((await db.template.count({ where: { companyId: null } })) === 0) {
    for (const t of PLATFORM_TEMPLATES) await db.template.create({ data: { companyId: null, title: t.title, description: t.description, kind: t.kind, isDefault: !!t.isDefault, sections: t.sections as any } });
  }
  await createSession(user.id);
  redirect('/projects');
}

export async function logoutAction() {
  await destroySession();
  redirect('/login');
}
