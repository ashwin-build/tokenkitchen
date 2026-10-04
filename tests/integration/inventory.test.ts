import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { platformPrisma, tenantDatabase } from "@/server/db/prisma";
import { createPurchaseForMembership, adjustStockForMembership } from "@/server/inventory/services";

type Fixture = {
  tenantId: string;
  ownerId: string;
  ingredientId: string;
  rollbackIngredientId: string;
  supplierId: string;
};

const ownerId = "user_inventory_owner";
const cashierId = "user_inventory_cashier";

async function createFixture(name: string): Promise<Fixture> {
  const suffix = crypto.randomUUID();
  const tenant = await platformPrisma.tenant.create({
    data: { name, slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${suffix.slice(0, 8)}` },
  });
  await platformPrisma.membership.createMany({
    data: [
      { tenantId: tenant.id, clerkUserId: ownerId, email: `${suffix}@owner.test`, role: "OWNER" },
      { tenantId: tenant.id, clerkUserId: cashierId, email: `${suffix}@cashier.test`, role: "CASHIER" },
    ],
  });
  await platformPrisma.subscription.create({
    data: { tenantId: tenant.id, status: "TRIALING", trialStartedAt: new Date(), trialEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
  });
  const database = tenantDatabase(tenant.id);
  const ingredient = await database.ingredient.create({
    data: { tenantId: tenant.id, name: `Flour ${suffix}`, unit: "KG", currentStock: "0", reorderLevel: "2", unitCostPaise: 100 },
  });
  const rollbackIngredient = await database.ingredient.create({
    data: { tenantId: tenant.id, name: `Rollback flour ${suffix}`, unit: "KG", currentStock: "0", unitCostPaise: 100 },
  });
  const supplier = await database.party.create({
    data: { tenantId: tenant.id, type: "SUPPLIER", name: `Supplier ${suffix}` },
  });
  return { tenantId: tenant.id, ownerId, ingredientId: ingredient.id, rollbackIngredientId: rollbackIngredient.id, supplierId: supplier.id };
}

function purchaseInput(fixture: Fixture, overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: crypto.randomUUID(),
    supplier: { partyId: fixture.supplierId },
    lines: [{ ingredientId: fixture.ingredientId, quantity: "10", unitCostPaise: "5000" }],
    paidNowPaise: "20000",
    paymentMode: "UPI",
    ...overrides,
  };
}

describe("inventory transactions", () => {
  let active: Fixture;
  let otherTenant: Fixture;
  let expired: Fixture;

  beforeAll(async () => {
    active = await createFixture("Inventory active");
    otherTenant = await createFixture("Inventory other");
    expired = await createFixture("Inventory expired");
    await platformPrisma.subscription.updateMany({
      where: { tenantId: expired.tenantId },
      data: { trialEndsAt: new Date(Date.now() - 60_000) },
    });
  });

  afterAll(async () => {
    await platformPrisma.$disconnect();
  });

  it("creates purchase, item snapshots, movements, latest cost, and supplier credit atomically", async () => {
    const result = await createPurchaseForMembership({ tenantId: active.tenantId, role: "OWNER", clerkUserId: ownerId }, purchaseInput(active));
    expect(result).toMatchObject({ totalPaise: 50000, paidPaise: 20000, balancePaise: 30000, replayed: false });

    const database = tenantDatabase(active.tenantId);
    const purchase = await database.purchase.findUniqueOrThrow({
      where: { id: result.id },
      include: { items: true, stockMovements: true, ledgerEntries: true },
    });
    const ingredient = await database.ingredient.findUniqueOrThrow({ where: { id: active.ingredientId } });
    expect(purchase.items).toMatchObject([{ ingredientName: expect.stringContaining("Flour"), quantity: expect.anything(), unitCostPaise: 5000, amountPaise: 50000 }]);
    expect(purchase.stockMovements).toMatchObject([{ type: "PURCHASE", quantityDelta: expect.anything() }]);
    expect(purchase.ledgerEntries).toMatchObject([{ direction: "CREDIT", amountPaise: 30000, partyId: active.supplierId }]);
    expect(ingredient.currentStock.toString()).toBe("10");
    expect(ingredient.unitCostPaise).toBe(5000);

    const replay = await createPurchaseForMembership({ tenantId: active.tenantId, role: "OWNER", clerkUserId: ownerId }, {
      ...purchaseInput(active),
      idempotencyKey: purchase.idempotencyKey,
    });
    expect(replay).toMatchObject({ id: purchase.id, replayed: true });
    expect(await database.purchase.count()).toBe(1);
  });

  it("rolls back purchase, supplier, movements, balance, and cost on a late write failure", async () => {
    const constraintName = `inventory_rollback_${crypto.randomUUID().replaceAll("-", "")}`;
    await platformPrisma.$executeRawUnsafe(
      `ALTER TABLE "Ingredient" ADD CONSTRAINT "${constraintName}" CHECK ("unitCostPaise" <> 1234)`,
    );
    const key = crypto.randomUUID();
    try {
      const input = purchaseInput(active, {
        idempotencyKey: key,
        supplier: { name: "Supplier should rollback" },
        lines: [{ ingredientId: active.rollbackIngredientId, quantity: "3", unitCostPaise: "1234" }],
        paidNowPaise: "0",
        paymentMode: undefined,
      });
      await expect(createPurchaseForMembership({ tenantId: active.tenantId, role: "MANAGER", clerkUserId: "user_inventory_manager" }, input)).rejects.toThrow();

      const database = tenantDatabase(active.tenantId);
      expect(await database.purchase.findFirst({ where: { idempotencyKey: key } })).toBeNull();
      expect(await database.stockMovement.count({ where: { ingredientId: active.rollbackIngredientId } })).toBe(0);
      expect((await database.ingredient.findUniqueOrThrow({ where: { id: active.rollbackIngredientId } })).currentStock.toString()).toBe("0");
      expect(await database.party.findFirst({ where: { name: "Supplier should rollback", type: "SUPPLIER" } })).toBeNull();
    } finally {
      await platformPrisma.$executeRawUnsafe(`ALTER TABLE "Ingredient" DROP CONSTRAINT "${constraintName}"`);
    }
  });

  it("writes count differences and named wastage/spoilage movements", async () => {
    const database = tenantDatabase(active.tenantId);
    const countResult = await adjustStockForMembership({ tenantId: active.tenantId, role: "MANAGER", clerkUserId: "user_inventory_manager" }, {
      kind: "COUNT",
      ingredientId: active.ingredientId,
      countedQuantity: "7.5",
      reason: "Weekly stock count",
    });
    expect(countResult.currentQuantity).toBe("7.5");
    const wastage = await adjustStockForMembership({ tenantId: active.tenantId, role: "OWNER", clerkUserId: ownerId }, {
      kind: "WASTAGE",
      ingredientId: active.ingredientId,
      quantity: "0.5",
      reason: "Spilled during prep",
    });
    const spoilage = await adjustStockForMembership({ tenantId: active.tenantId, role: "OWNER", clerkUserId: ownerId }, {
      kind: "SPOILAGE",
      ingredientId: active.ingredientId,
      quantity: "0.25",
      reason: "Past expiry",
    });
    expect(wastage.currentQuantity).toBe("7");
    expect(spoilage.currentQuantity).toBe("6.75");
    const movements = await database.stockMovement.findMany({
      where: { ingredientId: active.ingredientId, type: { in: ["ADJUSTMENT", "WASTAGE", "SPOILAGE"] } },
      orderBy: { createdAt: "asc" },
    });
    expect(movements.map((movement) => movement.type)).toEqual(["ADJUSTMENT", "WASTAGE", "SPOILAGE"]);
    expect(movements[0]?.quantityDelta.toString()).toBe("-2.5");
    expect(movements.every((movement) => movement.notes && movement.createdByClerkUserId)).toBe(true);
  });

  it("blocks Cashier writes, blocks expired tenants, and scopes purchase/movement/ledger reads", async () => {
    const before = await tenantDatabase(active.tenantId).purchase.count();
    await expect(createPurchaseForMembership({ tenantId: active.tenantId, role: "CASHIER", clerkUserId: cashierId }, purchaseInput(active)))
      .rejects.toThrow("Only an owner or manager can change ingredients and dishes");
    await expect(adjustStockForMembership({ tenantId: active.tenantId, role: "CASHIER", clerkUserId: cashierId }, {
      kind: "WASTAGE",
      ingredientId: active.ingredientId,
      quantity: "0.1",
      reason: "Cashier attempt",
    })).rejects.toThrow("Only an owner or manager can change ingredients and dishes");
    expect(await tenantDatabase(active.tenantId).purchase.count()).toBe(before);

    await expect(createPurchaseForMembership({ tenantId: expired.tenantId, role: "OWNER", clerkUserId: ownerId }, purchaseInput(expired)))
      .rejects.toThrow("This business plan has ended");
    expect(await tenantDatabase(expired.tenantId).purchase.count()).toBe(0);

    const purchase = await tenantDatabase(active.tenantId).purchase.findFirstOrThrow();
    expect(await tenantDatabase(otherTenant.tenantId).purchase.findUnique({ where: { id: purchase.id } })).toBeNull();
    expect(await tenantDatabase(otherTenant.tenantId).stockMovement.count({ where: { purchaseId: purchase.id } })).toBe(0);
    expect(await tenantDatabase(otherTenant.tenantId).ledgerEntry.count({ where: { purchaseId: purchase.id } })).toBe(0);
  });
});