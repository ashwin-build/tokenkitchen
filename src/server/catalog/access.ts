import { activeMembershipForCurrentUser } from "@/server/auth/active-membership";
import { assertCatalogEditor, type CatalogMembership } from "@/server/catalog/permissions";

export async function currentCatalogMembership(): Promise<CatalogMembership> {
  const membership = await activeMembershipForCurrentUser();
  return { tenantId: membership.tenantId, role: membership.role };
}

export async function currentCatalogEditor(): Promise<CatalogMembership> {
  const membership = await currentCatalogMembership();
  assertCatalogEditor(membership);
  return membership;
}