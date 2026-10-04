import type { MembershipRole } from "@/generated/prisma/client";

export type CatalogMembership = {
  tenantId: string;
  role: MembershipRole;
};

export class CatalogPermissionError extends Error {
  constructor() {
    super("Only an owner or manager can change ingredients and dishes.");
    this.name = "CatalogPermissionError";
  }
}

export function assertCatalogEditor(membership: CatalogMembership): void {
  if (membership.role !== "OWNER" && membership.role !== "MANAGER") {
    throw new CatalogPermissionError();
  }
}