// Campaigns of an ads account (spec v3 §2): read through the connector, the stored scope read from the integration config.
import type { Integration } from '@prisma/client';
import { connectorFor } from '@/lib/connectors';
import { isAdsSlug } from '@/lib/catalog/integrations';
import { campaignScopeOf } from '@/lib/engine/campaigns';

export { campaignScopeOf };
import { toCtx } from '@/lib/engine/report';
import type { Campaign } from '@/lib/engine/types';

/** The campaigns of an ads account from its connector; [] for other accounts and for connectors without the hook. */
export async function listCampaignsFor(row: Integration, project: { currency: string }): Promise<Campaign[]> {
  if (!isAdsSlug(row.slug)) return [];
  const ctx = toCtx(row, project);
  const c = connectorFor(ctx);
  if (!c.listCampaigns) return [];
  return c.listCampaigns({ integration: ctx });
}
