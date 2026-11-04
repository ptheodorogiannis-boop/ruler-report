import type { Connector } from '@/lib/engine/types';
import { getIntegrationDef } from '@/lib/catalog/integrations';
import { customConnector } from './custom';
import { demoConnector } from './demo';
import { facebookConnector } from './facebook';
import { gadsConnector } from './gads';
import { gbpConnector } from './gbp';
import { ga4Connector } from './ga4';
import { gscConnector } from './gsc';
import { instagramConnector } from './instagram';
import { matomoConnector } from './matomo';
import { metaConnector } from './meta';
import { wooConnector } from './woo';
import { youtubeConnector } from './youtube';

const REGISTRY: Record<string, Connector> = {
  demo: demoConnector,
  meta: metaConnector,
  ga4: ga4Connector,
  gads: gadsConnector,
  gsc: gscConnector,
  woo: wooConnector,
  facebook: facebookConnector,
  instagram: instagramConnector,
  youtube: youtubeConnector,
  gbp: gbpConnector,
  matomo: matomoConnector,
  sheets: customConnector,
  csv: customConnector,
  rest: customConnector,
  ingest: customConnector,
};

/** Add or override a connector at runtime (e.g. from a plugin). */
export function registerConnector(id: string, c: Connector) {
  REGISTRY[id] = c;
}
export function getConnector(id: string): Connector {
  return REGISTRY[id] ?? demoConnector;
}
/**
 * Sample data: an account flagged demo (credentials.demo), a platform without a live connector, or a Matomo row with no
 * address and token — every Matomo row was sample data before its connector (2026-11-04), whatever its flag, and stays so
 * until it is connected with an address and a token.
 */
export function usesSampleData(slug: string, credentials: Record<string, any> | null | undefined): boolean {
  if (credentials?.demo) return true;
  const def = getIntegrationDef(slug);
  if (!def || def.connector === 'demo') return true;
  if (def.connector === 'matomo') return !(credentials?.baseUrl && credentials?.tokenAuth);
  return false;
}
/** Sample-data integrations (usesSampleData) always use synthetic data, even on slugs that have a real connector. */
export function connectorFor(integration: { slug: string; credentials: Record<string, any> | null }): Connector {
  if (usesSampleData(integration.slug, integration.credentials)) return demoConnector;
  return getConnector(getIntegrationDef(integration.slug)?.connector ?? 'demo');
}
export const REAL_CONNECTORS = ['meta', 'gads', 'ga4', 'gsc', 'woo', 'facebook', 'instagram', 'youtube', 'gbp', 'matomo', 'sheets', 'csv', 'rest', 'ingest'];
