// Types for build.mjs, for the TypeScript tests that import it.
type Env = Record<string, string | undefined>;
export const PG_SCHEMA: string;
export function buildPlan(env: Env): string[];
export function pgSchema(src: string, env: Env): string;
