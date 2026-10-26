import type { Principal, Role } from '../src/lib/auth';

export async function principalFor(companyId: number, role: Role, projectIds: number[] | null): Promise<Principal> {
  return { kind: 'user', companyId, userId: 1, name: 'T', role, projectIds };
}
