import { redirect } from 'next/navigation';
import { getPrincipal } from '@/lib/auth';

export default async function Home() {
  const p = await getPrincipal();
  redirect(p ? (p.role === 'client' ? '/dashboards' : '/overview') : '/login');
}
