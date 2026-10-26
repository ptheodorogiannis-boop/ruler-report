// `@prisma/client` in the demo: only the runtime values the app's bundled modules read; the types stay type-only.
export const Prisma = { JsonNull: null, DbNull: null, AnyNull: null } as const;
export class PrismaClient {
  constructor() {
    throw new Error('PrismaClient is not available in the demo');
  }
}
