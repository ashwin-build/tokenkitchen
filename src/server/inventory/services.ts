import { Prisma } from "@/generated/prisma/client";
import { tenantDatabase } from "@/server/db/prisma";
import { assertCatalogEditor, type CatalogMembership } from "@/server/catalog/permissions";
import { quantityToMilliUnits } from "@/server/catalog/schemas";
import { calculatePurchaseTotals, PurchaseMathError } from "@/server/inventory/purchase-math";
import { purchaseRequestSchema, stockAdjustmentSchema } from "@/server/inventory/schemas";

type InventoryMembership = CatalogMembership & { clerkUserId: string };
type TenantDatabase = ReturnType<typeof tenantDatabase>;
type TenantTransaction = Parameters<Parameters<TenantDatabase["$transaction"]>[0]>[0];

export class InventoryServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryServiceError";
  }
}

type PurchaseResult = {
  id: string;
  totalPaise: number;
  paidPaise: number;
  balancePaise: number;
  supplierName: string;
  replayed: boolean;
};

function purchaseResult(purchase: {
  id: string;
  totalPaise: number;
  paidPaise: number;
  supplier: { name: string };
}, replayed: boolean): PurchaseResult {
  return {
    id: purchase.id,
    totalPaise: purchase.totalPaise,
    paidPaise: purchase.paidPaise,
    balancePaise: purchase.totalPaise - purchase.paidPaise,
    supplierName: purchase.supplier.name,
    replayed,
  };
}

async function lockIngredients(transaction: TenantTransaction, tenantId: string, ids: string[]) {
  if (ids.length === 0) return;
  await transaction.$queryRaw(Prisma.sql`
    SELECT "id" FROM "Ingredient"
    WHERE "tenantId" = ${tenantId} AND "id" IN (${Prisma.join(ids)})
    ORDER BY "id"
    FOR UPDATE
  `);
}

async function findOrCreateSupplier(
  transaction: TenantTransaction,
  tenantId: string,
  supplier: { partyId?: string; name?: string; phone?: string },
) {
  if (supplier.partyId) {
    const existing = await transaction.party.findFirst({
      where: { id: supplier.partyId, type: "SUPPLIER", isActive: true },
      select: { id: true, name: true },
    });
    if (!existing) throw new InventoryServiceError("That supplier is not available in this business.");
    return existing;
  }

  const name = supplier.name?.trim();
  if (!name) throw new InventoryServiceError("Choose a supplier or enter a supplier name.");
  const existing = await transaction.party.findFirst({
    where: { type: "SUPPLIER", isActive: true, name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (existing) return existing;

  return transaction.party.create({
    data: { tenantId, type: "SUPPLIER", name, phone: supplier.phone?.trim() || null },
    select: { id: true, name: true },
  });
}

export async function createPurchaseForMembership(membership: InventoryMembership, input: unknown): Promise<PurchaseResult> {
  assertCatalogEditor(membership);
  const request = purchaseRequestSchema.parse(input);
  let totals: ReturnType<typeof calculatePurchaseTotals>;
  try {
    totals = calculatePurchaseTotals(request.lines, request.paidNowPaise);
  } catch (error) {
    if (error instanceof PurchaseMathError) throw new InventoryServiceError(error.message);
    throw error;
  }
  if (totals.paidNowPaise > 0 && !request.paymentMode) throw new InventoryServiceError("Choose a payment mode.");

  const database = tenantDatabase(membership.tenantId);
  const previous = await database.purchase.findFirst({
    where: { idempotencyKey: request.idempotencyKey },
    include: { supplier: { select: { name: true } } },
  });
  if (previous) return purchaseResult(previous, true);

  try {
    return await database.$transaction(async (transaction) => {
      const supplier = await findOrCreateSupplier(transaction, membership.tenantId, request.supplier);
      const ingredientIds = request.lines.map((line) => line.ingredientId).sort();
      await lockIngredients(transaction, membership.tenantId, ingredientIds);
      const ingredients = await transaction.ingredient.findMany({
        where: { id: { in: ingredientIds }, isActive: true },
        select: { id: true, name: true, unit: true },
      });
      if (ingredients.length !== request.lines.length) {
        throw new InventoryServiceError("One or more ingredients are unavailable in this business.");
      }
      const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));

      const purchase = await transaction.purchase.create({
        data: {
          tenantId: membership.tenantId,
          supplierId: supplier.id,
          idempotencyKey: request.idempotencyKey,
          totalPaise: totals.totalPaise,
          paidPaise: totals.paidNowPaise,
          paymentMode: totals.paidNowPaise > 0 ? request.paymentMode : null,
          createdByClerkUserId: membership.clerkUserId,
        },
      });

      await transaction.purchaseItem.createMany({
        data: request.lines.map((line, index) => {
          const ingredient = ingredientById.get(line.ingredientId)!;
          return {
            tenantId: membership.tenantId,
            purchaseId: purchase.id,
            ingredientId: ingredient.id,
            ingredientName: ingredient.name,
            quantity: line.quantity,
            unit: ingredient.unit,
            unitCostPaise: line.unitCostPaise,
            amountPaise: totals.lineAmountsPaise[index]!,
          };
        }),
      });

      for (const line of request.lines) {
        const ingredient = ingredientById.get(line.ingredientId)!;
        await transaction.stockMovement.create({
          data: {
            tenantId: membership.tenantId,
            ingredientId: ingredient.id,
            purchaseId: purchase.id,
            type: "PURCHASE",
            quantityDelta: line.quantity,
            unitCostPaise: line.unitCostPaise,
            notes: `Purchase ${purchase.id}`,
            createdByClerkUserId: membership.clerkUserId,
          },
        });
        await transaction.ingredient.update({
          where: { id: ingredient.id },
          data: { unitCostPaise: line.unitCostPaise },
        });
      }

      if (totals.balancePaise > 0) {
        await transaction.ledgerEntry.create({
          data: {
            tenantId: membership.tenantId,
            partyId: supplier.id,
            purchaseId: purchase.id,
            direction: "CREDIT",
            amountPaise: totals.balancePaise,
            description: `Unpaid balance for purchase ${purchase.id}`,
          },
        });
      }

      return purchaseResult({ ...purchase, supplier }, false);
    }, { maxWait: 30000, timeout: 30000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await database.purchase.findFirst({
        where: { idempotencyKey: request.idempotencyKey },
        include: { supplier: { select: { name: true } } },
      });
      if (existing) return purchaseResult(existing, true);
    }
    if (error instanceof PurchaseMathError) throw new InventoryServiceError(error.message);
    throw error;
  }
}

export async function adjustStockForMembership(membership: InventoryMembership, input: unknown) {
  assertCatalogEditor(membership);
  const request = stockAdjustmentSchema.parse(input);
  const database = tenantDatabase(membership.tenantId);

  return database.$transaction(async (transaction) => {
    await lockIngredients(transaction, membership.tenantId, [request.ingredientId]);
    const ingredient = await transaction.ingredient.findFirst({
      where: { id: request.ingredientId, isActive: true },
      select: { id: true, name: true, unit: true, currentStock: true },
    });
    if (!ingredient) throw new InventoryServiceError("That active ingredient could not be found.");

    const isCount = request.kind === "COUNT";
    const quantityDelta = isCount
      ? quantityToMilliUnits(request.countedQuantity) - quantityToMilliUnits(ingredient.currentStock.toString())
      : -quantityToMilliUnits(request.quantity);
    const type = isCount ? "ADJUSTMENT" : request.kind;
    const label = isCount ? "Stock count" : request.kind === "WASTAGE" ? "Wastage" : "Spoilage";

    await transaction.stockMovement.create({
      data: {
        tenantId: membership.tenantId,
        ingredientId: ingredient.id,
        type,
        quantityDelta: `${quantityDelta < 0 ? "-" : ""}${formatMilliUnits(quantityDelta)}`,
        notes: `${label}: ${request.reason}`,
        createdByClerkUserId: membership.clerkUserId,
      },
    });
    const updated = await transaction.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } });
    return { ingredientId: ingredient.id, name: ingredient.name, currentQuantity: updated.currentStock.toString(), unit: ingredient.unit };
  });
}

function formatMilliUnits(value: bigint): string {
  const amount = value < BigInt(0) ? -value : value;
  const whole = amount / BigInt(1000);
  const fraction = (amount % BigInt(1000)).toString().padStart(3, "0").replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}`;
}