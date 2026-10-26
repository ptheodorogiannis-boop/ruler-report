// `@/lib/connectors` in the demo: every account runs on the app's own sample-data connector.
import type { Connector } from '@/lib/engine/types';
import { demoConnector } from '@/lib/connectors/demo';

export const REAL_CONNECTORS: string[] = [];
export function registerConnector(_id: string, _c: Connector) {}
export function getConnector(_id: string): Connector {
  return demoConnector;
}
export function connectorFor(_integration: { slug: string; credentials: Record<string, any> | null }): Connector {
  return demoConnector;
}
