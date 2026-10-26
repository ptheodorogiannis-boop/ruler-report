// Integration health at a glance (spec v3 §1.1): one chip per row on the project's Integrations tab. Server component;
// the words follow the request locale through `tr` (spec v3 §5).
import { AlertTriangle, CheckCircle2, Clock3, HelpCircle } from 'lucide-react';
import { tr } from '@/lib/i18n/request';

const day = (d: Date) => d.toISOString().slice(0, 10);

export function HealthChip({
  health,
  tokenExpiresAt,
  healthCheckedAt,
  error,
  lastError,
  lastSyncAt,
  now = new Date(),
}: {
  health: string;
  tokenExpiresAt: Date | null;
  healthCheckedAt: Date | null;
  error: string | null;
  /** the last report fetch (sync) — still speaks when no health check has run, and overrides "Connected" when it failed */
  lastError?: string | null;
  lastSyncAt?: Date | null;
  now?: Date;
}) {
  if (health !== 'failing' && lastError) {
    return (
      <span className="inline-flex items-center gap-1 text-red-600" title={lastError} data-health="sync-failed">
        <AlertTriangle size={13} /> {tr('health.syncFailed')}
        {lastSyncAt ? <span className="text-red-400"> · {day(lastSyncAt)}</span> : null}
      </span>
    );
  }
  if (health === 'failing') {
    return (
      <span className="inline-flex items-center gap-1 text-red-600" title={error ?? tr('health.lastCheckFailed')} data-health="failing">
        <AlertTriangle size={13} /> {tr('health.failing')}
        {healthCheckedAt ? <span className="text-red-400"> · {tr('health.checked', { date: day(healthCheckedAt) })}</span> : null}
      </span>
    );
  }
  if (health === 'expiring' && tokenExpiresAt) {
    const days = Math.ceil((tokenExpiresAt.getTime() - now.getTime()) / 86400000);
    return (
      <span className="inline-flex items-center gap-1 text-amber-700" title={tr('health.expiresOn', { date: day(tokenExpiresAt) })} data-health="expiring">
        <Clock3 size={13} /> {days <= 1 ? tr('health.expiresTomorrow') : tr('health.expiresIn', { days })}
      </span>
    );
  }
  if (health === 'ok') {
    return (
      <span className="inline-flex items-center gap-1 text-slate-500" data-health="ok">
        <CheckCircle2 size={13} className="text-emerald-500" /> {tr('health.connected')}
        {healthCheckedAt ? <span className="text-slate-400"> · {tr('health.checked', { date: day(healthCheckedAt) })}</span> : lastSyncAt ? <span className="text-slate-400"> · {tr('health.synced', { date: day(lastSyncAt) })}</span> : null}
      </span>
    );
  }
  if (lastSyncAt) {
    return (
      <span className="inline-flex items-center gap-1 text-slate-500" data-health="unknown">
        <CheckCircle2 size={13} className="text-emerald-500" /> {tr('health.synced', { date: day(lastSyncAt) })}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-slate-400" data-health="unknown">
      <HelpCircle size={13} /> {tr('health.notChecked')}
    </span>
  );
}
