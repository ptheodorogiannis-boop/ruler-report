// Types for mock-providers.mjs, for the TypeScript tests that import it.
import type { Server } from 'node:http';

export interface MockSeen {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: any;
  query: Record<string, string>;
}
export const FIXTURES: any;
export function mockCode(scopes: string[]): string;
/** a goal of the stand-in Matomo, as Goals.getGoals answers it */
export interface MockMatomoGoal {
  idgoal: string;
  name: string;
}
export function createMockProviders(opts?: { gbpQuota?: boolean }): { server: Server; state: { seen: MockSeen[]; gbpQuota: boolean; matomoGoals: MockMatomoGoal[] } };
