import { tenantDatabase } from "@/server/db/prisma";
import { currentBillingMembership } from "@/server/billing/access";
import { csvResponse, serializeCsv } from "@/server/catalog/csv";
import { movementFilterSchema } from "@/server/inventory/schemas";

function utcForLocalMidnight(date: string, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const target = Date.UTC(year!, month! - 1, day!);
  let guess = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
    const represented = Date.UTC(values.year!, values.month! - 1, values.day!, values.hour!, values.minute!, values.second!);
    guess += target - represented;
  }
  return new Date(guess);
}

function nextCalendarDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year!, month! - 1, day! + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

export async function getInventoryPageData() {
  const membership = await currentBillingMembership();
  const database = tenantDatabase(membership.tenantId);
  const [ingredients, suppliers] = await Promise.all([
    database.ingredient.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    database.party.findMany({
      where: { type: "SUPPLIER", isActive: true },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
      take: 100,
    }),
  ]);

  const items = ingredients.map((ingredient) => ({
    id: ingredient.id,
    name: ingredient.name,
    unit: ingredient.unit.toLowerCase(),
    currentQuantity: ingredient.currentStock.toString(),
    reorderLevel: ingredient.reorderLevel?.toString() ?? null,
    unitCostPaise: ingredient.unitCostPaise,
    active: ingredient.isActive,
  }));
  const lowStock = items.filter((ingredient) => ingredient.active && ingredient.reorderLevel !== null
    && Number(ingredient.currentQuantity) <= Number(ingredient.reorderLevel));

  return { items, suppliers, lowStock, canEdit: membership.role === "OWNER" || membership.role === "MANAGER" };
}

export async function listStockMovements(rawFilters: unknown) {
  const parsed = movementFilterSchema.safeParse(rawFilters);
  if (!parsed.success) {
    return { movements: [], filters: {}, error: parsed.error.issues[0]?.message ?? "Check the movement filters." };
  }

  const membership = await currentBillingMembership();
  const database = tenantDatabase(membership.tenantId);
  const tenant = await database.tenant.findUniqueOrThrow({ where: { id: membership.tenantId } });
  const { ingredientId, type, from, to } = parsed.data;
  const createdAt = from || to ? {
    ...(from ? { gte: utcForLocalMidnight(from, tenant.timezone) } : {}),
    ...(to ? { lt: utcForLocalMidnight(nextCalendarDate(to), tenant.timezone) } : {}),
  } : undefined;
  const [movements, ingredients] = await Promise.all([
    database.stockMovement.findMany({
      where: {
        ...(ingredientId ? { ingredientId } : {}),
        ...(type ? { type } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      include: {
        ingredient: { select: { name: true, unit: true } },
        order: { select: { invoiceNo: true, tokenNo: true } },
        purchase: { select: { id: true, supplier: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
    database.ingredient.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const rows = movements.map((movement) => ({
    id: movement.id,
    createdAt: movement.createdAt.toISOString(),
    ingredientId: movement.ingredientId,
    ingredientName: movement.ingredient.name,
    unit: movement.ingredient.unit.toLowerCase(),
    type: movement.type,
    quantityDelta: movement.quantityDelta.toString(),
    unitCostPaise: movement.unitCostPaise,
    source: movement.order ? `Invoice ${movement.order.invoiceNo}`
      : movement.purchase ? `Purchase · ${movement.purchase.supplier.name}`
        : movement.notes ?? movement.type,
    notes: movement.notes ?? "",
  }));

  return {
    movements: rows,
    ingredients,
    filters: { ingredientId: ingredientId ?? "", type: type ?? "", from: from ?? "", to: to ?? "" },
    error: "",
  };
}

export async function stockMovementCsv(rawFilters: unknown) {
  const result = await listStockMovements(rawFilters);
  if (result.error) return Response.json({ error: result.error }, { status: 400 });
  return csvResponse("tokenkitchen-stock-movements.csv", serializeCsv(
    ["date", "ingredient", "type", "quantityDelta", "unit", "unitCostPaise", "source", "notes"],
    result.movements.map((movement) => [
      movement.createdAt,
      movement.ingredientName,
      movement.type,
      movement.quantityDelta,
      movement.unit,
      movement.unitCostPaise ?? "",
      movement.source,
      movement.notes,
    ]),
  ));
}