'use client';

import { useState } from 'react';
import { useT } from '@/components/i18n-provider';
import { ActionForm } from './action-form';

export interface GoalOption {
  integrationId: number;
  label: string;
  metrics: { key: string; title: string }[];
}

export function GoalForm({ projectId, options, action }: { projectId: number; options: GoalOption[]; action: (prev: any, fd: FormData) => Promise<any> }) {
  const t = useT();
  const [iid, setIid] = useState(options[0]?.integrationId ?? 0);
  const current = options.find((o) => o.integrationId === iid);
  return (
    <ActionForm action={action} submit={t('goals.create')} className="grid gap-3 md:grid-cols-3">
      <input type="hidden" name="projectId" value={projectId} />
      <div>
        <label className="label">{t('goals.integration')}</label>
        <select name="integrationId" className="input" value={iid} onChange={(e) => setIid(Number(e.target.value))}>
          {options.map((o) => (
            <option key={o.integrationId} value={o.integrationId}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">{t('goals.metric')}</label>
        <select name="referenceKey" className="input">
          {current?.metrics.map((m) => (
            <option key={m.key} value={m.key}>
              {m.title}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">{t('goals.target')}</label>
        <input name="target" type="number" step="any" min="0" required className="input" placeholder="e.g. 5000" />
      </div>
      <div>
        <label className="label">{t('goals.titleOptional')}</label>
        <input name="title" className="input" placeholder={t('goals.titlePlaceholder')} />
      </div>
      <div>
        <label className="label">{t('goals.alertEmails')}</label>
        <input name="alertEmails" className="input" placeholder="pm@agency.com, client@brand.com" />
      </div>
      <div>
        <label className="label">{t('common.period')}</label>
        <select name="frequency" className="input">
          <option value="monthly">{t('automations.monthly')}</option>
          <option value="weekly">{t('automations.weekly')}</option>
        </select>
      </div>
      <div>
        <label className="label">{t('goals.direction')}</label>
        <select name="direction" className="input">
          <option value="higher_better">{t('goals.higher')}</option>
          <option value="lower_better">{t('goals.lower')}</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm md:col-span-3">
        <input type="checkbox" name="alert" defaultChecked /> {t('goals.alertMe')}
      </label>
    </ActionForm>
  );
}
