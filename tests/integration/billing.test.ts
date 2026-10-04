import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { platformPrisma, tenantDatabase } from "@/server/db/prisma";
import { createBillForMembership, cancelOrderForMembership, changeOrderStatusForMembership, updateStockModeForMembership } from "@/server/billing/service";

type Fixture = {
  tenantId: string;
  ownerId: string;
  dishId: string;
  ingredientId: string;
};

const ownerClerkId = "user_owner_test";
const cashierClerkId = "user_cashier_test";

async function createFixture(input: { label: string; stockMode?: "ENFORCE" | "WARN"; stock?: string }): Promise<Fixture> {
  const unique = crypto.randomUUID();
  const tenant = await platformPrisma.tenant.create({
    data: {
      name: input.label,
      slug: `${input.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${unique.slice(0, 8)}`,
      stockMode: input.stockMode ?? "ENFORCE",
    },
  });
  const membership = await platformPrisma.membership.create({
    data: { tenantId: tenant.id, clerkUserId: ownerClerkId, email: `${unique}@tokenkitchen.test`, role: "OWNER" },
  });
  await platformPrisma.subscription.create({
    data: {
      tenantId: tenant.id,
      status: "ACTIVE",
      currentPeriodStartedAt: new Date(Date.now() - 60_000),
      currentPeriodEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  const ingredient = await tenantDatabase(tenant.id).ingredient.create({
    data: { tenantId: tenant.id, name: `Ingredient ${unique}`, unit: "KG", currentStock: "0", unitCostPaise: 500 },
  });
  if (input.stock && input.stock !== "0") {
    await tenantDatabase(tenant.id).stockMovement.create({
      data: { tenantId: tenant.id, ingredientId: ingredient.id, type: "OPENING", quantityDelta: input.stock, notes: "Opening stock" },
    });
  }
  const dish = await tenantDatabase(tenant.id).dish.create({
    data: { tenantId: tenant.id, name: `Dish ${unique}`, pricePaise: 10000, gstRate: 0 },
  });
  await tenantDatabase(tenant.id).recipeLine.create({
    data: { tenantId: tenant.id, dishId: dish.id, ingredientId: ingredient.id, quantityPerDish: "0.001", unit: "KG" },
  });
  return { tenantId: tenant.id, ownerId: membership.clerkUserId, dishId: dish.id, ingredientId: ingredient.id };
}

function bill(fixture: Fixture, idempotencyKey = crypto.randomUUID()) {
  return {
    idempotencyKey,
    items: [{ dishId: fixture.dishId, quantity: "1" }],
    payments: [{ mode: "CASH" as const, amountPaise: 10000 }],
  };
}

describe("counter billing transactions", () => {
  let main: Fixture;
  let emptyWarn: Fixture;
  let expired: Fixture;
  let cutoff: Fixture;
  let taxSettings: Fixture;

  beforeAll(async () => {
    main = await createFixture({ label: "Billing Main", stock: "1" });
    emptyWarn = await createFixture({ label: "Billing Warn", stockMode: "WARN", stock: "0" });
    expired = await createFixture({ label: "Billing Expired", stock: "1" });
    cutoff = await createFixture({ label: "Billing Cutoff", stock: "1" });
    taxSettings = await createFixture({ label: "Billing Tax", stock: "1" });
    await platformPrisma.membership.create({
      data: { tenantId: main.tenantId, clerkUserId: cashierClerkId, email: "cashier@tokenkitchen.test", role: "CASHIER" },
    });
  });

  afterAll(async () => {
    await platformPrisma.$disconnect();
  });

  it("allocates gapless unique token and invoice counters for 20 parallel bills", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () =>
      createBillForMembership({ tenantId: main.tenantId, role: "OWNER", clerkUserId: main.ownerId }, bill(main)),
    ));
    expect(new Set(results.map((result) => result.tokenNo)).size).toBe(20);
    expect(new Set(results.map((result) => result.invoiceNo)).size).toBe(20);
    expect(results.map((result) => result.tokenNo).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(results.map((result) => Number(result.invoiceNo.split("/").at(-1))).sort((a, b) => a - b))
      .toEqual(Array.from({ length: 20 }, (_, index) => index + 1));

    const ingredient = await tenantDatabase(main.tenantId).ingredient.findUniqueOrThrow({ where: { id: main.ingredientId } });
    expect(ingredient.currentStock.toString()).toBe("0.98");
    const saleCount = await tenantDatabase(main.tenantId).stockMovement.count({ where: { type: "SALE" } });
    expect(saleCount).toBe(20);
  });

  it("rolls back a stock-short sale without consuming counters, payments, or movements", async () => {
    const beforeOrders = await tenantDatabase(main.tenantId).order.count();
    const beforePayments = await tenantDatabase(main.tenantId).payment.count();
    const beforeMoves = await tenantDatabase(main.tenantId).stockMovement.count();
    const beforeCounters = await tenantDatabase(main.tenantId).sequenceCounter.findMany({ orderBy: { kind: "asc" } });
    const shortageBill = {
      idempotencyKey: crypto.randomUUID(),
      items: [{ dishId: main.dishId, quantity: "2000" }],
      payments: [{ mode: "CASH", amountPaise: 1000000 }],
    };

    await expect(createBillForMembership({ tenantId: main.tenantId, role: "OWNER", clerkUserId: main.ownerId }, shortageBill))
      .rejects.toThrow(/Not enough stock:.*Ingredient/s);
    expect(await tenantDatabase(main.tenantId).order.count()).toBe(beforeOrders);
    expect(await tenantDatabase(main.tenantId).payment.count()).toBe(beforePayments);
    expect(await tenantDatabase(main.tenantId).stockMovement.count()).toBe(beforeMoves);
    expect(await tenantDatabase(main.tenantId).sequenceCounter.findMany({ orderBy: { kind: "asc" } })).toEqual(beforeCounters);
  });

  it("returns the original order on idempotency replay", async () => {
    const key = crypto.randomUUID();
    const input = bill(cutoff, key);
    const first = await createBillForMembership({ tenantId: cutoff.tenantId, role: "OWNER", clerkUserId: cutoff.ownerId }, input);
    const replay = await createBillForMembership({ tenantId: cutoff.tenantId, role: "OWNER", clerkUserId: cutoff.ownerId }, {
      ...input,
      items: [{ dishId: cutoff.dishId, quantity: "2" }],
    });
    expect(replay).toMatchObject({ id: first.id, tokenNo: first.tokenNo, invoiceNo: first.invoiceNo, replayed: true });
    expect(await tenantDatabase(cutoff.tenantId).order.count()).toBe(1);
  });

  it("snapshots menu values and records cash change separately", async () => {
    const result = await createBillForMembership({ tenantId: cutoff.tenantId, role: "OWNER", clerkUserId: cutoff.ownerId }, {
      idempotencyKey: crypto.randomUUID(),
      items: [{ dishId: cutoff.dishId, quantity: "1" }],
      payments: [{ mode: "CASH", amountPaise: 12000 }],
    });
    await tenantDatabase(cutoff.tenantId).dish.update({ where: { id: cutoff.dishId }, data: { pricePaise: 20000, gstRate: 18 } });

    const order = await tenantDatabase(cutoff.tenantId).order.findUniqueOrThrow({
      where: { id: result.id },
      include: { items: true, payments: true },
    });
    expect(order.totalPaise).toBe(10000);
    expect(order.items[0]?.dishName).toContain("Dish");
    expect(order.items[0]?.unitPricePaise).toBe(10000);
    expect(order.items[0]?.gstRate.toString()).toBe("0");
    expect(order.payments[0]).toMatchObject({ amountPaise: 12000, changePaise: 2000 });
    await tenantDatabase(cutoff.tenantId).dish.update({ where: { id: cutoff.dishId }, data: { pricePaise: 10000, gstRate: 0 } });
  });

  it("uses each tenant's inclusive or exclusive GST setting for stored line tax", async () => {
    await tenantDatabase(taxSettings.tenantId).dish.update({ where: { id: taxSettings.dishId }, data: { gstRate: 5 } });
    const inclusive = await createBillForMembership({ tenantId: taxSettings.tenantId, role: "OWNER", clerkUserId: taxSettings.ownerId }, bill(taxSettings));
    const inclusiveOrder = await tenantDatabase(taxSettings.tenantId).order.findUniqueOrThrow({
      where: { id: inclusive.id },
      include: { items: true },
    });
    expect(inclusiveOrder.items[0]?.taxableAmountPaise).toBe(9524);
    expect(inclusiveOrder.cgstPaise + inclusiveOrder.sgstPaise).toBe(476);

    await tenantDatabase(taxSettings.tenantId).tenant.update({ where: { id: taxSettings.tenantId }, data: { pricesIncludeGst: false } });
    const exclusive = await createBillForMembership({ tenantId: taxSettings.tenantId, role: "OWNER", clerkUserId: taxSettings.ownerId }, {
      idempotencyKey: crypto.randomUUID(),
      items: [{ dishId: taxSettings.dishId, quantity: "1" }],
      payments: [{ mode: "CASH", amountPaise: 10500 }],
    });
    const exclusiveOrder = await tenantDatabase(taxSettings.tenantId).order.findUniqueOrThrow({
      where: { id: exclusive.id },
      include: { items: true },
    });
    expect(exclusiveOrder.items[0]?.taxableAmountPaise).toBe(10000);
    expect(exclusiveOrder.items[0]?.cgstPaise + exclusiveOrder.items[0]?.sgstPaise).toBe(500);
  });

  it("allows cashier forward status flow and attributes each transition", async () => {
    const result = await createBillForMembership({ tenantId: cutoff.tenantId, role: "OWNER", clerkUserId: cutoff.ownerId }, bill(cutoff));
    await changeOrderStatusForMembership({ tenantId: cutoff.tenantId, role: "CASHIER", clerkUserId: cashierClerkId }, {
      orderId: result.id,
      nextStatus: "READY",
    });
    await changeOrderStatusForMembership({ tenantId: cutoff.tenantId, role: "MANAGER", clerkUserId: "user_manager_test" }, {
      orderId: result.id,
      nextStatus: "COMPLETED",
    });
    await expect(changeOrderStatusForMembership({ tenantId: cutoff.tenantId, role: "CASHIER", clerkUserId: cashierClerkId }, {
      orderId: result.id,
      nextStatus: "READY",
    })).rejects.toThrow("That order can no longer move to this status");

    const order = await tenantDatabase(cutoff.tenantId).order.findUniqueOrThrow({ where: { id: result.id }, include: { auditEvents: true } });
    expect(order.status).toBe("COMPLETED");
    expect(order.auditEvents.filter((event) => event.action === "STATUS_CHANGED").map((event) => event.actorClerkUserId))
      .toEqual([cashierClerkId, "user_manager_test"]);
  });

  it("creates a customer ledger debit for an unpaid remainder", async () => {
    const result = await createBillForMembership({ tenantId: cutoff.tenantId, role: "OWNER", clerkUserId: cutoff.ownerId }, {
      idempotencyKey: crypto.randomUUID(),
      items: [{ dishId: cutoff.dishId, quantity: "1" }],
      customer: { name: "Mina Customer", phone: "9876543210" },
      payments: [{ mode: "UPI", amountPaise: 4000 }],
    });
    expect(result.balancePaise).toBe(6000);
    const order = await tenantDatabase(cutoff.tenantId).order.findUniqueOrThrow({
      where: { id: result.id },
      include: { payments: true, ledgerEntries: true },
    });
    expect(order.payments).toHaveLength(1);
    expect(order.ledgerEntries).toMatchObject([{ direction: "DEBIT", amountPaise: 6000 }]);
    expect(order.partyId).toBeTruthy();
  });

  it("cancellation keeps the invoice, reverses stock and credit, and records the actor", async () => {
    const stockBeforeBill = (await tenantDatabase(main.tenantId).ingredient.findUniqueOrThrow({ where: { id: main.ingredientId } })).currentStock.toString();
    const result = await createBillForMembership({ tenantId: main.tenantId, role: "OWNER", clerkUserId: main.ownerId }, {
      idempotencyKey: crypto.randomUUID(),
      items: [{ dishId: main.dishId, quantity: "1" }],
      customer: { name: "Cancel Customer" },
      payments: [],
    });
    const original = await tenantDatabase(main.tenantId).order.findUniqueOrThrow({ where: { id: result.id } });
    await expect(cancelOrderForMembership({ tenantId: main.tenantId, role: "CASHIER", clerkUserId: cashierClerkId }, {
      orderId: result.id,
      reason: "Cashier cannot cancel",
    })).rejects.toThrow(/owner or manager/);

    await cancelOrderForMembership({ tenantId: main.tenantId, role: "MANAGER", clerkUserId: "user_manager_test" }, {
      orderId: result.id,
      reason: "Customer changed their order",
    });

    const cancelled = await tenantDatabase(main.tenantId).order.findUniqueOrThrow({
      where: { id: result.id },
      include: { ledgerEntries: true, auditEvents: true },
    });
    const afterStock = (await tenantDatabase(main.tenantId).ingredient.findUniqueOrThrow({ where: { id: main.ingredientId } })).currentStock.toString();
    expect(cancelled).toMatchObject({ status: "CANCELLED", invoiceNo: original.invoiceNo, cancelReason: "Customer changed their order" });
    expect(afterStock).toBe(stockBeforeBill);
    expect(cancelled.ledgerEntries.map((entry) => entry.direction)).toEqual(["DEBIT", "CREDIT"]);
    expect(cancelled.auditEvents.some((event) => event.actorClerkUserId === "user_manager_test" && event.action === "CANCELLED")).toBe(true);
  });

  it("allows warn-mode shortages and flags the order while enforce mode rejects them", async () => {
    const result = await createBillForMembership({ tenantId: emptyWarn.tenantId, role: "OWNER", clerkUserId: emptyWarn.ownerId }, bill(emptyWarn));
    expect(result.stockShortage).toBe(true);
    expect((await tenantDatabase(emptyWarn.tenantId).ingredient.findUniqueOrThrow({ where: { id: emptyWarn.ingredientId } })).currentStock.toString()).toBe("-0.001");
  });

  it("blocks expired subscriptions and isolates orders, payments, and counters", async () => {
    await platformPrisma.subscription.updateMany({
      where: { tenantId: expired.tenantId },
      data: { status: "TRIALING", trialEndsAt: new Date(Date.now() - 1000) },
    });
    await expect(createBillForMembership({ tenantId: expired.tenantId, role: "OWNER", clerkUserId: expired.ownerId }, bill(expired)))
      .rejects.toThrow("This business plan has ended");

    const mainOrder = await tenantDatabase(main.tenantId).order.findFirstOrThrow();
    expect(await tenantDatabase(expired.tenantId).order.findUnique({ where: { id: mainOrder.id } })).toBeNull();
    expect(await tenantDatabase(expired.tenantId).payment.count({ where: { orderId: mainOrder.id } })).toBe(0);
    expect(await tenantDatabase(expired.tenantId).sequenceCounter.findMany()).toHaveLength(0);
  });

  it("resets tokens after cutoff but keeps invoice sequence on financial year", async () => {
    await platformPrisma.subscription.updateMany({
      where: { tenantId: expired.tenantId },
      data: { status: "ACTIVE", currentPeriodEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });
    const first = await createBillForMembership(
      { tenantId: expired.tenantId, role: "OWNER", clerkUserId: expired.ownerId },
      bill(expired),
      new Date("2026-03-31T22:29:00.000Z"),
    );
    const second = await createBillForMembership(
      { tenantId: expired.tenantId, role: "OWNER", clerkUserId: expired.ownerId },
      bill(expired),
      new Date("2026-03-31T22:30:00.000Z"),
    );
    expect(first.tokenNo).toBe(1);
    expect(second.tokenNo).toBe(1);
    const firstOrder = await tenantDatabase(expired.tenantId).order.findFirstOrThrow({ where: { invoiceNo: first.invoiceNo } });
    const secondOrder = await tenantDatabase(expired.tenantId).order.findFirstOrThrow({ where: { invoiceNo: second.invoiceNo } });
    expect(firstOrder.businessDate.toISOString().slice(0, 10)).toBe("2026-03-31");
    expect(secondOrder.businessDate.toISOString().slice(0, 10)).toBe("2026-04-01");
    expect(Number(second.invoiceNo.split("/").at(-1))).toBe(Number(first.invoiceNo.split("/").at(-1)) + 1);
    expect(first.invoiceNo).toContain("2026-27");
    expect(second.invoiceNo).toContain("2026-27");
  });

  it("restricts stock mode changes to the Owner", async () => {
    await expect(updateStockModeForMembership({ tenantId: main.tenantId, role: "MANAGER" }, "WARN"))
      .rejects.toThrow("Only an owner can change stock mode");
    await updateStockModeForMembership({ tenantId: main.tenantId, role: "OWNER" }, "WARN");
    expect((await tenantDatabase(main.tenantId).tenant.findUniqueOrThrow({ where: { id: main.tenantId } })).stockMode).toBe("WARN");
  });
});