import { IngredientUnit } from "@/generated/prisma/client";
import { assertCatalogEditor, type CatalogMembership } from "@/server/catalog/permissions";
import { tenantDatabase } from "@/server/db/prisma";
import { dishCsvHeaders, ingredientCsvHeaders } from "@/server/catalog/schemas";
import { parseDishImport, parseIngredientImport, type CatalogImportKind, type ParsedDishImport, type ParsedIngredientImport, type ParsedImportRow } from "@/server/catalog/import-format";
import { quantityToMilliUnits } from "@/server/catalog/schemas";
import { csvResponse, serializeCsv } from "@/server/catalog/csv";
import { currentCatalogMembership } from "@/server/catalog/access";

export type ImportRowPreview = {
  rowNumber: number;
  name: string;
  action: "add" | "update" | "skip";
  errors: string[];
};

export type CatalogImportPreview = {
  kind: CatalogImportKind;
  rows: ImportRowPreview[];
  counts: { added: number; updated: number; skipped: number };
  errors: string[];
  sourceCsv: string;
};

type IngredientPlanRow = {
  rowNumber: number;
  name: string;
  action: "add" | "update" | "skip";
  data?: ParsedIngredientImport;
  existing?: { id: string; unit: IngredientUnit; currentStock: string };
  errors: string[];
};

type DishPlanRow = {
  rowNumber: number;
  name: string;
  action: "add" | "update" | "skip";
  data?: Omit<ParsedDishImport, "recipe"> & { recipe: { ingredientId: string; quantityPerDish: string }[] };
  existingId?: string;
  errors: string[];
};

type TenantDatabase = ReturnType<typeof tenantDatabase>;
type TenantTransaction = Parameters<Parameters<TenantDatabase["$transaction"]>[0]>[0];

export class CatalogImportError extends Error {
  constructor(readonly preview: CatalogImportPreview) {
    super(preview.errors[0] ?? preview.rows.find((row) => row.errors.length > 0)?.errors[0] ?? "Import could not be confirmed.");
    this.name = "CatalogImportError";
  }
}

const databaseUnit = {
  kg: IngredientUnit.KG,
  g: IngredientUnit.G,
  L: IngredientUnit.L,
  ml: IngredientUnit.ML,
  pcs: IngredientUnit.PCS,
} as const;

function summarize(kind: CatalogImportKind, rows: ImportRowPreview[], errors: string[], sourceCsv: string): CatalogImportPreview {
  return {
    kind,
    rows,
    counts: {
      added: rows.filter((row) => row.action === "add").length,
      updated: rows.filter((row) => row.action === "update").length,
      skipped: rows.filter((row) => row.action === "skip").length,
    },
    errors,
    sourceCsv,
  };
}

function markDuplicateImportNames<T>(rows: ParsedImportRow<T>[]): ParsedImportRow<T>[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    const key = row.name.toLocaleLowerCase("en-IN");
    if (!key || !seen.has(key)) {
      if (key) seen.add(key);
      return row;
    }
    return { ...row, data: undefined, errors: [...row.errors, "This name appears more than once in the file."] };
  });
}

function quantityFromMilliUnits(value: bigint): string {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const whole = absolute / BigInt(1000);
  const fraction = (absolute % BigInt(1000)).toString().padStart(3, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

async function planIngredientRows(
  transaction: TenantTransaction,
  rows: ParsedImportRow<ParsedIngredientImport>[],
): Promise<IngredientPlanRow[]> {
  const ingredients = await transaction.ingredient.findMany({
    select: { id: true, name: true, unit: true, currentStock: true },
  });
  const ingredientsByName = new Map(ingredients.map((ingredient) => [ingredient.name.toLocaleLowerCase("en-IN"), ingredient]));
  const candidateRows = markDuplicateImportNames(rows);
  const planned = candidateRows.map((row): IngredientPlanRow => {
    if (!row.data || row.errors.length > 0) {
      return { rowNumber: row.rowNumber, name: row.name, action: "skip", errors: row.errors };
    }
    const existing = ingredientsByName.get(row.name.toLocaleLowerCase("en-IN"));
    return {
      rowNumber: row.rowNumber,
      name: row.name,
      action: existing ? "update" : "add",
      data: row.data,
      existing: existing ? {
        id: existing.id,
        unit: existing.unit,
        currentStock: existing.currentStock.toString(),
      } : undefined,
      errors: [],
    };
  });

  const unitChangeIds = planned.flatMap((row) => row.data && row.existing && databaseUnit[row.data.unit] !== row.existing.unit
    ? [row.existing.id]
    : []);
  const archiveIds = planned.flatMap((row) => row.data && row.existing && !row.data.active ? [row.existing.id] : []);
  if (unitChangeIds.length === 0 && archiveIds.length === 0) return planned;

  const [movementReferences, recipeReferences] = await Promise.all([
    unitChangeIds.length > 0
      ? transaction.stockMovement.findMany({
          where: { ingredientId: { in: unitChangeIds } },
          select: { ingredientId: true },
          distinct: ["ingredientId"],
        })
      : [],
    transaction.recipeLine.findMany({
      where: {
        ingredientId: { in: [...unitChangeIds, ...archiveIds] },
        dish: { isActive: true },
      },
      select: { ingredientId: true },
      distinct: ["ingredientId"],
    }),
  ]);
  const movementIds = new Set(movementReferences.map((movement) => movement.ingredientId));
  const activeRecipeIds = new Set(recipeReferences.map((line) => line.ingredientId));

  return planned.map((row) => {
    if (!row.data || !row.existing) return row;
    const errors = [...row.errors];
    const unitChanged = databaseUnit[row.data.unit] !== row.existing.unit;
    if (unitChanged && (movementIds.has(row.existing.id) || activeRecipeIds.has(row.existing.id))) {
      errors.push("Unit cannot be changed after this ingredient has stock or recipe history.");
    }
    if (!row.data.active && activeRecipeIds.has(row.existing.id)) {
      errors.push("Remove this ingredient from active recipes before archiving it.");
    }
    return errors.length > 0 ? { ...row, action: "skip", errors } : row;
  });
}

async function planDishRows(
  transaction: TenantTransaction,
  rows: ParsedImportRow<ParsedDishImport>[],
): Promise<DishPlanRow[]> {
  const [dishes, ingredients] = await Promise.all([
    transaction.dish.findMany({ select: { id: true, name: true } }),
    transaction.ingredient.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    }),
  ]);
  const dishesByName = new Map(dishes.map((dish) => [dish.name.toLocaleLowerCase("en-IN"), dish]));
  const ingredientsByName = new Map(ingredients.map((ingredient) => [ingredient.name.toLocaleLowerCase("en-IN"), ingredient]));

  return markDuplicateImportNames(rows).map((row): DishPlanRow => {
    if (!row.data || row.errors.length > 0) {
      return { rowNumber: row.rowNumber, name: row.name, action: "skip", errors: row.errors };
    }
    const errors: string[] = [];
    const recipe = row.data.recipe.map((line) => {
      const ingredient = ingredientsByName.get(line.ingredientName.toLocaleLowerCase("en-IN"));
      if (!ingredient) errors.push(`Unknown or archived ingredient: ${line.ingredientName}.`);
      return ingredient ? { ingredientId: ingredient.id, quantityPerDish: line.quantityPerDish } : null;
    }).filter((line): line is { ingredientId: string; quantityPerDish: string } => line !== null);
    if (new Set(recipe.map((line) => line.ingredientId)).size !== recipe.length) {
      errors.push("Use each ingredient only once in a recipe.");
    }

    const existing = dishesByName.get(row.name.toLocaleLowerCase("en-IN"));
    return {
      rowNumber: row.rowNumber,
      name: row.name,
      action: errors.length > 0 ? "skip" : existing ? "update" : "add",
      data: errors.length > 0 ? undefined : { ...row.data, recipe },
      existingId: existing?.id,
      errors,
    };
  });
}

async function computePreview(membership: CatalogMembership, kind: CatalogImportKind, sourceCsv: string) {
  assertCatalogEditor(membership);
  const database = tenantDatabase(membership.tenantId);
  const parsed = kind === "ingredients" ? parseIngredientImport(sourceCsv) : parseDishImport(sourceCsv);
  if (parsed.errors.length > 0) return summarize(kind, [], parsed.errors, sourceCsv);
  if (parsed.rows.length === 0) return summarize(kind, [], ["The CSV contains no data rows."], sourceCsv);

  return database.$transaction(async (transaction) => {
    const planned = kind === "ingredients"
      ? await planIngredientRows(transaction, parsed.rows as ParsedImportRow<ParsedIngredientImport>[])
      : await planDishRows(transaction, parsed.rows as ParsedImportRow<ParsedDishImport>[]);
    return summarize(kind, planned.map(({ rowNumber, name, action, errors }) => ({ rowNumber, name, action, errors })), [], sourceCsv);
  });
}

export async function previewCatalogImport(membership: CatalogMembership, kind: CatalogImportKind, sourceCsv: string) {
  try {
    return await computePreview(membership, kind, sourceCsv);
  } catch (error) {
    return summarize(kind, [], [error instanceof Error ? error.message : "The CSV could not be previewed."], sourceCsv);
  }
}

function hasRowErrors(preview: CatalogImportPreview): boolean {
  return preview.errors.length > 0 || preview.rows.some((row) => row.errors.length > 0);
}

async function applyIngredientPlan(transaction: TenantTransaction, rows: IngredientPlanRow[], tenantId: string) {
  for (const row of rows) {
    if (!row.data || row.action === "skip") continue;
    const data = row.data;
    if (row.action === "add") {
      const ingredient = await transaction.ingredient.create({
        data: {
          tenantId,
          name: data.name,
          unit: databaseUnit[data.unit],
          currentStock: "0",
          reorderLevel: data.reorderLevel,
          unitCostPaise: data.costPerUnitPaise,
          isActive: data.active,
        },
      });
      await transaction.stockMovement.create({
        data: {
          tenantId,
          ingredientId: ingredient.id,
          type: "OPENING",
          quantityDelta: data.currentQuantity,
          notes: "Opening stock from CSV import",
        },
      });
    } else if (row.existing) {
      await transaction.ingredient.update({
        where: { id: row.existing.id },
        data: {
          name: data.name,
          unit: databaseUnit[data.unit],
          reorderLevel: data.reorderLevel,
          unitCostPaise: data.costPerUnitPaise,
          isActive: data.active,
        },
      });
      const delta = quantityToMilliUnits(data.currentQuantity) - quantityToMilliUnits(row.existing.currentStock);
      if (delta !== BigInt(0)) {
        await transaction.stockMovement.create({
          data: {
            tenantId,
            ingredientId: row.existing.id,
            type: "ADJUSTMENT",
            quantityDelta: quantityFromMilliUnits(delta),
            notes: "Quantity adjusted by CSV import",
          },
        });
      }
    }
  }
}

async function applyDishPlan(transaction: TenantTransaction, rows: DishPlanRow[], tenantId: string) {
  for (const row of rows) {
    if (!row.data || row.action === "skip") continue;
    const data = row.data;
    const dish = row.action === "update" && row.existingId
      ? await transaction.dish.update({
          where: { id: row.existingId },
          data: { name: data.name, pricePaise: data.pricePaise, gstRate: data.gstRate, isActive: data.active },
        })
      : await transaction.dish.create({
          data: { tenantId, name: data.name, pricePaise: data.pricePaise, gstRate: data.gstRate, isActive: data.active },
        });

    if (row.action === "update") {
      await transaction.recipeLine.deleteMany({ where: { dishId: dish.id } });
    }
    if (data.recipe.length > 0) {
      const ingredients = await transaction.ingredient.findMany({
        where: { id: { in: data.recipe.map((line) => line.ingredientId) } },
        select: { id: true, unit: true },
      });
      const unitsById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient.unit]));
      await transaction.recipeLine.createMany({
        data: data.recipe.map((line) => ({
          tenantId,
          dishId: dish.id,
          ingredientId: line.ingredientId,
          quantityPerDish: line.quantityPerDish,
          unit: unitsById.get(line.ingredientId)!,
        })),
      });
    }
  }
}

export async function confirmCatalogImport(membership: CatalogMembership, kind: CatalogImportKind, sourceCsv: string) {
  assertCatalogEditor(membership);
  const database = tenantDatabase(membership.tenantId);
  const parsed = kind === "ingredients" ? parseIngredientImport(sourceCsv) : parseDishImport(sourceCsv);
  if (parsed.errors.length > 0 || parsed.rows.length === 0) {
    throw new CatalogImportError(summarize(kind, [], parsed.errors.length > 0 ? parsed.errors : ["The CSV contains no data rows."], sourceCsv));
  }

  return database.$transaction(async (transaction) => {
    const plannedRows = kind === "ingredients"
      ? await planIngredientRows(transaction, parsed.rows as ParsedImportRow<ParsedIngredientImport>[])
      : await planDishRows(transaction, parsed.rows as ParsedImportRow<ParsedDishImport>[]);
    const preview = summarize(kind, plannedRows.map(({ rowNumber, name, action, errors }) => ({ rowNumber, name, action, errors })), [], sourceCsv);
    if (hasRowErrors(preview)) throw new CatalogImportError(preview);

    if (kind === "ingredients") {
      await applyIngredientPlan(transaction, plannedRows as IngredientPlanRow[], membership.tenantId);
    } else {
      await applyDishPlan(transaction, plannedRows as DishPlanRow[], membership.tenantId);
    }
    return preview;
  });
}

export async function exportCatalogCsv(kind: CatalogImportKind) {
  const membership = await currentCatalogMembership();
  const database = tenantDatabase(membership.tenantId);
  if (kind === "ingredients") {
    const ingredients = await database.ingredient.findMany({ orderBy: { name: "asc" } });
    return csvResponse("tokenkitchen-ingredients.csv", serializeCsv(ingredientCsvHeaders, ingredients.map((item) => [
      item.name,
      item.unit === "KG" ? "kg" : item.unit === "G" ? "g" : item.unit === "L" ? "L" : item.unit === "ML" ? "ml" : "pcs",
      item.currentStock.toString(),
      item.reorderLevel?.toString() ?? "",
      item.unitCostPaise,
      String(item.isActive),
    ])));
  }

  const dishes = await database.dish.findMany({
    include: { recipeLines: { include: { ingredient: { select: { name: true } } }, orderBy: { createdAt: "asc" } } },
    orderBy: { name: "asc" },
  });
  return csvResponse("tokenkitchen-dishes.csv", serializeCsv(dishCsvHeaders, dishes.map((item) => [
    item.name,
    item.pricePaise,
    item.gstRate,
    String(item.isActive),
    item.recipeLines.map((line) => `${line.ingredient.name}:${line.quantityPerDish.toString()}`).join("|"),
  ])));
}

export function templateCsv(kind: CatalogImportKind) {
  const headers = kind === "ingredients" ? ingredientCsvHeaders : dishCsvHeaders;
  const filename = kind === "ingredients" ? "tokenkitchen-ingredients-template.csv" : "tokenkitchen-dishes-template.csv";
  return csvResponse(filename, serializeCsv(headers, []));
}