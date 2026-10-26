// PDF and CSV downloads through the page's `downloads` capability (the viewer confirms each file). Claude pages block
// <a download> and the print dialog, so this is the only way a file leaves the demo.
import { bus, type Locale } from './bus';
import { demoT } from './demo-strings';
import { getDb } from './server/store';
import { reportView } from '@/lib/layout/service';
import { reportToCsv } from '@/lib/services/export';

type Downloads = { save(req: { filename: string; data: Blob | string }): Promise<{ status: string }> };
let cap: Promise<Downloads | null> | null = null;

function downloads(): Promise<Downloads | null> {
  cap ??= (async () => {
    try {
      const c = (globalThis as any).claude;
      return c?.use ? ((await c.use('downloads')) as Downloads | null) : null;
    } catch {
      return null;
    }
  })();
  return cap;
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'report';

export async function saveFile(filename: string, data: Blob | string, locale: Locale): Promise<void> {
  const d = await downloads();
  if (!d) return bus.toast(demoT(locale, 'downloadsUnavailable'));
  try {
    await d.save({ filename, data });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'declined') return;
    bus.toast(demoT(locale, code === 'rate_limited' ? 'downloadBusy' : code === 'unavailable' || code === 'not_granted' ? 'downloadsUnavailable' : 'downloadFailed'));
  }
}

/** `/api/pdf/<token>?layout=…&lang=…` → the PDF rendered by the server at capture time. */
export async function downloadPdf(href: string, appLocale: Locale): Promise<void> {
  const u = new URL(href, 'http://demo');
  const token = u.pathname.split('/').pop() ?? '';
  const layout = u.searchParams.get('layout') === 'pages' ? 'pages' : 'flow';
  const r = await getDb().report.findFirst({ where: { shareToken: token }, include: { project: true } });
  const lang = u.searchParams.get('lang') === 'el' || u.searchParams.get('lang') === 'en' ? u.searchParams.get('lang')! : (r as any)?.project?.locale === 'el' ? 'el' : 'en';
  const res = await fetch(`pdf/${token}-${layout}-${lang}.pdf`).catch(() => null);
  if (!res?.ok) return bus.toast(demoT(appLocale, 'pdfOnlySamples'));
  await saveFile(`${safeName(String(r?.title ?? 'report'))}.pdf`, await res.blob(), appLocale);
}

/** `/api/v2/reports/<id>/export.csv` → the app's own CSV of the report as it stands in the demo. */
export async function downloadCsv(href: string, appLocale: Locale): Promise<void> {
  const id = Number(href.match(/reports\/(\d+)\//)?.[1]);
  const r = await getDb().report.findFirst({ where: { id }, include: { project: true } });
  if (!r) return bus.toast(demoT(appLocale, 'downloadFailed'));
  const { data } = await reportView(r as any);
  await saveFile(`${safeName(String(r.title))}.csv`, reportToCsv(data, ((r as any).project?.locale === 'el' ? 'el' : 'en') as Locale), appLocale);
}
