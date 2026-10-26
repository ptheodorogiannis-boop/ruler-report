// Types for build.mjs, for the TypeScript tests that import it.
import type { BuildResult } from 'esbuild';
export function bundle(opts?: { write?: boolean }): Promise<BuildResult>;
export const PAGE: (parts: { css?: string; js?: string }) => string;
