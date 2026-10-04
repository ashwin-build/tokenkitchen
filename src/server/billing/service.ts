import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import type { CatalogMembership } from "@/server/catalog/permissions";
import { assertCatalogEditor } from "@/server/catalog/permissions";
import { tenantDatabase } from "@/server/db/prisma";
import { allocatePayments, BillCalculationError, calculateBillLine, calculateInvoiceTotals } from "@/server/billing/calculations";
import { billRequestSchema, cancelOrderSchema, statusTransitionSchema } from "@/server/billing/schemas";
import { getBusinessDate, getCalendarDate, getFinancialYear } from "@/server/billing/business-time";
import { z } from "zod";

type TenantDatabase = ReturnType<typeof tenantDatabase>;
type TenantTransaction = Parameters<Parameters<TenantDatabase["$transaction"]>[0]>[0];
type BillingMembership = CatalogMembership & { clerkUserId: string };
const stockModeSchema = z.enum(["ENFORCE", "WARN"]);

export class BillServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillServiceError";
  }
}

type BillResult = {
  id: string;
  tokenNo: number;
  invoiceNo: string;
  totalPaise: number;
  paidPaise: number;
  balancePaise: number;
  roundOffPaise: number;
  stockShortage: boolean;
  replayed: boolean;
};

async function nextCounter(transaction: TenantTransaction, tenantId: string, kind: "TOKEN" | "INVOICE", periodKey: string): Promise<number> {
  const rows = await transaction.$queryRaw<{ value: number }[]>(Prisma.sql`
    INSERT INTO "SequenceCounter" ("id", "tenantId", "kind", "periodKey", "value", "updatedAt")
    VALUES (${randomUUID()}, ${tenantId}, ${kind}::"SequenceCounterKind", ${periodKey}, 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("tenantId", "kind", "periodKey")
    DO UPDATE SET "value" = "SequenceCounter"."value" + 1, "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "value"
  `);
  return rows[0]!.value;
}

function milliUnits(value: string): bigint {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const amount = BigInt(whole) * BigInt(1000) + BigInt(fraction.padEnd(3, "0"));
  return negative ? -amount : amount;
}

function quantityString(value: bigint): string {
  const negative = value < BigInt(0);
  const amount = negative ? -value : value;
  const whole = amount / BigInt(1000);
  const decimals = (amount % BigInt(1000)).toString().padStart(3, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${decimals ? `.${decimals}` : ""}`;
}

function roundedProductMilliUnits(perServing: string, servings: string): bigint {
  return (milliUnits(perServing) * milliUnits(servings) + BigInt(500)) / BigInt(1000);
}

function formatNeededStock(dishNames: string[], ingredientName: string, needed: bigint, available: bigint, unit: string): string {
  return `${dishNames.join(", ")} needs ${quantityString(needed)} ${unit} of ${ingredientName}; ${quantityString(available)} ${unit} available.`;
}

async function lockIngredients(transaction: TenantTransaction, tenantId: string, ingredientIds: string[]) {
  if (ingredientIds.length === 0) return;
  await transaction.$queryRaw(Prisma.sql`
    SELECT "id" FROM "Ingredient"
    WHERE "tenantId" = ${tenantId} AND "id" IN (${Prisma.join(ingredientIds)})
    ORDER BY "id"
    FOR UPDATE
  `);
}

async function lockOrder(transaction: TenantTransaction, tenantId: string, orderId: string) {
  await transaction.$queryRaw(Prisma.sql`
    SELECT "id" FROM "Order"
    WHERE "tenantId" = ${tenantId} AND "id" = ${orderId}
    FOR UPDATE
  `);
}

async function createCustomer(transaction: TenantTransaction, tenantId: string, customer?: { partyId?: string; name?: string; phone?: string }) {
  if (!customer) return undefined;
  if (customer.partyId) {
    const party = await transaction.party.findFirst({
      where: { id: customer.partyId, type: "CUSTOMER", isActive: true },
      select: { id: true },
    });
    if (!party) throw new BillServiceError("That customer is not available in this business.");
    return party.id;
  }
  if (!customer.name?.trim()) return undefined;
  const party = await transaction.party.create({
    data: {
      tenantId,
      type: "CUSTOMER",
      name: customer.name.trim(),
      phone: customer.phone?.trim() || null,
    },
    select: { id: true },
  });
  return party.id;
}

function asBillResult(order: {
  id: string;
  tokenNo: number;
  invoiceNo: string;
  totalPaise: number;
  paidPaise: number;
  roundOffPaise: number;
  stockShortage: boolean;
}, replayed: boolean): BillResult {
  return {
    id: order.id,
    tokenNo: order.tokenNo,
    invoiceNo: order.invoiceNo,
    totalPaise: order.totalPaise,
    paidPaise: order.paidPaise,
    balancePaise: order.totalPaise - order.paidPaise,
    roundOffPaise: order.roundOffPaise,
    stockShortage: order.stockShortage,
    replayed,
  };
}

export async function createBillForMembership(membership: BillingMembership, input: unknown, now = new Date()): Promise<BillResult> {
  const request = billRequestSchema.parse(input);
  const database = tenantDatabase(membership.tenantId);

  const previous = await database.order.findFirst({ where: { idempotencyKey: request.idempotencyKey } });
  if (previous) return asBillResult(previous, true);

  try {
    return await database.$transaction(async (transaction) => {
      const tenant = await transaction.tenant.findUniqueOrThrow({ where: { id: membership.tenantId } });
      const dishes = await transaction.dish.findMany({
        where: { id: { in: request.items.map((item) => item.dishId) }, isActive: true },
        include: {
          recipeLines: {
            include: { ingredient: { select: { id: true, name: true, unit: true, currentStock: true, unitCostPaise: true, isActive: true } } },
          },
        },
      });
      if (dishes.length !== request.items.length) {
        throw new BillServiceError("One or more dishes are unavailable. Refresh the menu and try again.");
      }

      const dishById = new Map(dishes.map((dish) => [dish.id, dish]));
      const billLines = request.items.map((item) => {
        const dish = dishById.get(item.dishId)!;
        return calculateBillLine({
          dishId: dish.id,
          dishName: dish.name,
          unit: "portion",
          unitPricePaise: dish.pricePaise,
          gstRate: dish.gstRate,
          quantity: item.quantity,
        }, tenant.pricesIncludeGst);
      });
      const totals = calculateInvoiceTotals(billLines);
      if (totals.totalPaise > 2147483647) throw new BillServiceError("This bill exceeds the supported total.");

      const allIngredientIds = [...new Set(dishes.flatMap((dish) => dish.recipeLines.map((line) => line.ingredientId)))].sort();
      await lockIngredients(transaction, membership.tenantId, allIngredientIds);
      const ingredients = allIngredientIds.length > 0
        ? await transaction.ingredient.findMany({ where: { id: { in: allIngredientIds } } })
        : [];
      const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
      const demands = new Map<string, { amount: bigint; dishes: Map<string, bigint> }>();
      for (const item of request.items) {
        const dish = dishById.get(item.dishId)!;
        for (const recipeLine of dish.recipeLines) {
          const ingredient = ingredientById.get(recipeLine.ingredientId);
          if (!ingredient?.isActive) throw new BillServiceError(`An ingredient in ${dish.name} is no longer active.`);
          const amount = roundedProductMilliUnits(recipeLine.quantityPerDish.toString(), item.quantity);
          const demand = demands.get(ingredient.id) ?? { amount: BigInt(0), dishes: new Map<string, bigint>() };
          demand.amount += amount;
          demand.dishes.set(dish.name, (demand.dishes.get(dish.name) ?? BigInt(0)) + amount);
          demands.set(ingredient.id, demand);
        }
      }

      const shortages: string[] = [];
      for (const [ingredientId, demand] of demands) {
        const ingredient = ingredientById.get(ingredientId)!;
        const available = milliUnits(ingredient.currentStock.toString());
        if (available < demand.amount) {
          shortages.push(formatNeededStock([...demand.dishes.keys()], ingredient.name, demand.amount, available, ingredient.unit.toLowerCase()));
        }
      }
      const stockShortage = shortages.length > 0;
      if (stockShortage && tenant.stockMode === "ENFORCE") {
        throw new BillServiceError(`Not enough stock:\n${shortages.join("\n")}`);
      }

      const customerId = await createCustomer(transaction, membership.tenantId, request.customer);
      const paymentAllocation = allocatePayments(request.payments, totals.totalPaise, Boolean(customerId));
      const businessDate = getBusinessDate(now, tenant.timezone, tenant.businessDayCutoffMinutes);
      const financialYear = getFinancialYear(getCalendarDate(now, tenant.timezone));
      const tokenNo = await nextCounter(transaction, membership.tenantId, "TOKEN", businessDate);
      const invoiceCount = await nextCounter(transaction, membership.tenantId, "INVOICE", financialYear.key);
      const invoiceNo = `TK/${financialYear.shortKey}/${String(invoiceCount).padStart(6, "0")}`;
      const order = await transaction.order.create({
        data: {
          tenantId: membership.tenantId,
          tokenNo,
          businessDate: new Date(`${businessDate}T00:00:00.000Z`),
          invoiceNo,
          financialYear: financialYear.key,
          status: "PREPARING",
          taxMode: tenant.pricesIncludeGst ? "INCLUSIVE" : "EXCLUSIVE",
          subtotalPaise: totals.subtotalPaise,
          cgstPaise: totals.cgstPaise,
          sgstPaise: totals.sgstPaise,
          roundOffPaise: totals.roundOffPaise,
          totalPaise: totals.totalPaise,
          paidPaise: paymentAllocation.paidPaise,
          stockShortage,
          idempotencyKey: request.idempotencyKey,
          partyId: customerId,
        },
      });

      await transaction.orderItem.createMany({
        data: billLines.map((line) => ({
          tenantId: membership.tenantId,
          orderId: order.id,
          dishId: line.dishId,
          dishName: line.dishName,
          quantity: line.quantity,
          unit: line.unit,
          unitPricePaise: line.unitPricePaise,
          gstRate: String(line.gstRate),
          taxableAmountPaise: line.taxableAmountPaise,
          cgstPaise: line.cgstPaise,
          sgstPaise: line.sgstPaise,
          totalPaise: line.totalPaise,
        })),
      });

      if (paymentAllocation.payments.length > 0) {
        await transaction.payment.createMany({
          data: paymentAllocation.payments.map((payment) => ({
            tenantId: membership.tenantId,
            orderId: order.id,
            mode: payment.mode,
            amountPaise: payment.amountPaise,
            changePaise: payment.changePaise,
          })),
        });
      }

      if (paymentAllocation.balancePaise > 0 && customerId) {
        await transaction.ledgerEntry.create({
          data: {
            tenantId: membership.tenantId,
            partyId: customerId,
            orderId: order.id,
            direction: "DEBIT",
            amountPaise: paymentAllocation.balancePaise,
            description: `Unpaid balance for invoice ${invoiceNo}`,
          },
        });
      }

      for (const [ingredientId, demand] of demands) {
        await transaction.stockMovement.create({
          data: {
            tenantId: membership.tenantId,
            ingredientId,
            orderId: order.id,
            type: "SALE",
            quantityDelta: quantityString(-demand.amount),
            notes: `Sale for token ${tokenNo}`,
          },
        });
      }

      await transaction.orderAuditEvent.create({
        data: {
          tenantId: membership.tenantId,
          orderId: order.id,
          actorClerkUserId: membership.clerkUserId,
          action: "CREATED",
          toStatus: "PREPARING",
        },
      });

      return asBillResult(order, false);
    }, { maxWait: 60000, timeout: 60000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await database.order.findFirst({ where: { idempotencyKey: request.idempotencyKey } });
      if (existing) return asBillResult(existing, true);
    }
    if (error instanceof BillCalculationError) throw new BillServiceError(error.message);
    throw error;
  }
}

export async function changeOrderStatusForMembership(membership: BillingMembership, input: unknown) {
  const request = statusTransitionSchema.parse(input);
  const database = tenantDatabase(membership.tenantId);
  return database.$transaction(async (transaction) => {
    await lockOrder(transaction, membership.tenantId, request.orderId);
    const order = await transaction.order.findUnique({ where: { id: request.orderId } });
    if (!order) throw new BillServiceError("Order not found.");
    const expected = order.status === "PREPARING" ? "READY" : order.status === "READY" ? "COMPLETED" : null;
    if (expected !== request.nextStatus) throw new BillServiceError("That order can no longer move to this status.");

    await transaction.order.update({ where: { id: order.id }, data: { status: request.nextStatus } });
    await transaction.orderAuditEvent.create({
      data: {
        tenantId: membership.tenantId,
        orderId: order.id,
        actorClerkUserId: membership.clerkUserId,
        action: "STATUS_CHANGED",
        fromStatus: order.status,
        toStatus: request.nextStatus,
      },
    });
  });
}

export async function cancelOrderForMembership(membership: BillingMembership, input: unknown) {
  if (membership.role === "CASHIER") throw new BillServiceError("Only an owner or manager can cancel orders.");
  const request = cancelOrderSchema.parse(input);
  const database = tenantDatabase(membership.tenantId);
  return database.$transaction(async (transaction) => {
    await lockOrder(transaction, membership.tenantId, request.orderId);
    const order = await transaction.order.findUnique({
      where: { id: request.orderId },
      include: { stockMovements: { where: { type: "SALE" } }, ledgerEntries: { where: { direction: "DEBIT" } } },
    });
    if (!order) throw new BillServiceError("Order not found.");
    if (order.status === "CANCELLED") throw new BillServiceError("This order is already cancelled.");

    for (const movement of order.stockMovements) {
      await transaction.stockMovement.create({
        data: {
          tenantId: membership.tenantId,
          ingredientId: movement.ingredientId,
          orderId: order.id,
          type: "ADJUSTMENT",
          quantityDelta: quantityString(-milliUnits(movement.quantityDelta.toString())),
          notes: `Cancellation reversal for invoice ${order.invoiceNo}`,
        },
      });
    }

    for (const entry of order.ledgerEntries) {
      await transaction.ledgerEntry.create({
        data: {
          tenantId: membership.tenantId,
          partyId: entry.partyId,
          orderId: order.id,
          direction: "CREDIT",
          amountPaise: entry.amountPaise,
          description: `Reversal of cancelled invoice ${order.invoiceNo}`,
        },
      });
    }

    await transaction.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED", cancelReason: request.reason, cancelledAt: new Date(), cancelledByClerkUserId: membership.clerkUserId },
    });
    await transaction.orderAuditEvent.create({
      data: {
        tenantId: membership.tenantId,
        orderId: order.id,
        actorClerkUserId: membership.clerkUserId,
        action: "CANCELLED",
        fromStatus: order.status,
        toStatus: "CANCELLED",
        reason: request.reason,
      },
    });
  });
}

export async function updateStockModeForMembership(membership: CatalogMembership, stockMode: unknown) {
  assertCatalogEditor(membership);
  if (membership.role !== "OWNER") throw new BillServiceError("Only an owner can change stock mode.");
  const parsed = stockModeSchema.safeParse(stockMode);
  if (!parsed.success) throw new BillServiceError("Choose enforce or warn stock mode.");
  return tenantDatabase(membership.tenantId).tenant.update({ where: { id: membership.tenantId }, data: { stockMode: parsed.data } });
}

export async function updatePricesIncludeGstForMembership(membership: CatalogMembership, value: unknown) {
  assertCatalogEditor(membership);
  if (membership.role !== "OWNER") throw new BillServiceError("Only an owner can change invoice tax settings.");
  const parsed = z.enum(["true", "false"]).safeParse(value);
  if (!parsed.success) throw new BillServiceError("Choose whether menu prices include GST.");
  return tenantDatabase(membership.tenantId).tenant.update({
    where: { id: membership.tenantId },
    data: { pricesIncludeGst: parsed.data === "true" },
  });
}