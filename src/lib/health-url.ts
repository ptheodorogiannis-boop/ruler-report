// Pure: where "Reconnect" sends the user (spec v3 §1.2). Kept apart from services/health.ts so shared components can import it
// without pulling the mailer and the database into client bundles.
export function reconnectUrl(i: { id: number; projectId: number; slug: string }): string {
  return `/projects/${i.projectId}/connect/${i.slug}?reconnect=${i.id}`;
}
