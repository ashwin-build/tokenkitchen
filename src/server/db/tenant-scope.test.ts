import { describe, expect, it } from "vitest";
import { scopeArguments, scopeTenantRootArguments } from "@/server/db/tenant-scope";

describe("tenant query scope", () => {
  it("overrides a caller-supplied tenant ID in filters", () => {
    expect(
      scopeArguments({ where: { id: "record-1", tenantId: "tenant-b" } }, "findMany", "tenant-a"),
    ).toEqual({ where: { id: "record-1", tenantId: "tenant-a" } });
  });

  it("assigns the active tenant to single and bulk creates", () => {
    expect(
      scopeArguments({ data: { tenantId: "tenant-b", name: "Dish" } }, "create", "tenant-a"),
    ).toEqual({ data: { tenantId: "tenant-a", name: "Dish" } });

    expect(
      scopeArguments({ data: [{ name: "One" }, { tenantId: "tenant-b", name: "Two" }] }, "createMany", "tenant-a"),
    ).toEqual({ data: [{ name: "One", tenantId: "tenant-a" }, { tenantId: "tenant-a", name: "Two" }] });
  });

  it("scopes root tenant reads by ID and rejects tenant-row writes", () => {
    expect(scopeTenantRootArguments({ where: { id: "tenant-b" } }, "findUnique", "tenant-a"))
      .toEqual({ where: { id: "tenant-a", AND: [{ id: "tenant-b" }] } });
    expect(() => scopeTenantRootArguments({ where: { id: "tenant-b" } }, "update", "tenant-a"))
      .toThrow("This record can only be changed by a verified system event.");
  });
});
