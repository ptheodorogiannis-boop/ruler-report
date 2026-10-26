// Types for aliases.mjs (the bundler substitutions), for the TypeScript tests that import it.
import type { Plugin } from 'esbuild';
export const repoRoot: string;
export const aliases: Record<string, string>;
export const replacedFiles: Record<string, string>;
export const browserAliases: Record<string, string>;
export function demoAliasPlugin(opts?: { browser?: boolean; externalPackages?: boolean }): Plugin;
