import { IngredientUnit } from "@/generated/prisma/client";
import { tenantDatabase } from "@/server/db/prisma";
import { calculateRecipeCostPaise } from "@/server/catalog/math";
import { assertCatalogEditor, type CatalogMembership } from "@/server/catalog/permissions";
import { dishFormSchema, ingredientFormSchema, type ingredientUnits } from "@/server/catalog/schemas";

const unitToDatabase = {
  kg: IngredientUnit.KG,
  g: IngredientUnit.G,
  L: IngredientUnit.L,
  ml: IngredientUnit.ML,
  pcs: IngredientUnit.PCS,
} satisfies Record<(typeof ingredientUnits)[number], IngredientUnit>;

export class CatalogConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogConflictError";
  }
}

export async function saveIngredientForMembership(membership: CatalogMembership, input: unknown) {
  assertCatalogEditor(membership);
  const ingredient = ingredientFormSchema.parse(input);
  const database = tenantDatabase(membership.tenantId);
  const databaseUnit = unitToDatabase[ingredient.unit];

  return database.$transaction(async (transaction) => {
    const nameCollision = await transaction.ingredient.findFirst({
      where: {
        name: { equals: ingredient.name, mode: "insensitive" },
        ...(ingredient.id ? { id: { not: ingredient.id } } : {}),
      },
      select: { id: true },
    });
    if (nameCollision) {
      throw new CatalogConflictError("An ingredient with that name already exists.");
    }

    if (ingredient.id) {
      const existing = await transaction.ingredient.findUnique({ where: { id: ingredient.id } });
      if (!existing) throw new CatalogConflictError("That ingredient could not be found.");
      if (existing.isActive && !ingredient.isActive) {
        const activeRecipeLine = await transaction.recipeLine.findFirst({
          where: { ingredientId: ingredient.id, dish: { isActive: true } },
          select: { id: true },
        });
        if (activeRecipeLine) {
          throw new CatalogConflictError("Remove this ingredient from active recipes before archiving it.");
        }
      }
      if (existing.unit !== databaseUnit) {
        const [movementCount, recipeCount] = await Promise.all([
          transaction.stockMovement.count({ where: { ingredientId: ingredient.id } }),
          transaction.recipeLine.count({ where: { ingredientId: ingredient.id } }),
        ]);
        if (movementCount > 0 || recipeCount > 0) {
          throw new CatalogConflictError("Unit cannot be changed after this ingredient has stock or recipe history.");
        }
      }

      return transaction.ingredient.update({
        where: { id: ingredient.id },
        data: {
          name: ingredient.name,
          unit: databaseUnit,
          reorderLevel: ingredient.reorderLevel,
          unitCostPaise: ingredient.costPerUnitPaise,
          isActive: ingredient.isActive,
        },
      });
    }

    const created = await transaction.ingredient.create({
      data: {
        tenantId: membership.tenantId,
        name: ingredient.name,
        unit: databaseUnit,
        currentStock: "0",
        reorderLevel: ingredient.reorderLevel,
        unitCostPaise: ingredient.costPerUnitPaise,
        isActive: ingredient.isActive,
      },
    });

    await transaction.stockMovement.create({
      data: {
        tenantId: membership.tenantId,
        ingredientId: created.id,
        type: "OPENING",
        quantityDelta: ingredient.openingQuantity,
        notes: "Opening stock",
      },
    });

    return transaction.ingredient.findUniqueOrThrow({ where: { id: created.id } });
  });
}

export async function archiveIngredientForMembership(membership: CatalogMembership, ingredientId: unknown) {
  assertCatalogEditor(membership);
  const id = parseCatalogId(ingredientId);
  const database = tenantDatabase(membership.tenantId);
  const activeRecipeLine = await database.recipeLine.findFirst({
    where: { ingredientId: id, dish: { isActive: true } },
    select: { id: true },
  });
  if (activeRecipeLine) {
    throw new CatalogConflictError("Remove this ingredient from active recipes before archiving it.");
  }

  const result = await database.ingredient.updateMany({ where: { id }, data: { isActive: false } });
  if (result.count !== 1) throw new CatalogConflictError("That ingredient could not be found.");
}

export async function saveDishForMembership(membership: CatalogMembership, input: unknown) {
  assertCatalogEditor(membership);
  const dish = dishFormSchema.parse(input);
  const ingredientIds = dish.recipeLines.map((line) => line.ingredientId);
  if (new Set(ingredientIds).size !== ingredientIds.length) {
    throw new CatalogConflictError("Use each ingredient only once in a recipe.");
  }

  const database = tenantDatabase(membership.tenantId);
  return database.$transaction(async (transaction) => {
    const nameCollision = await transaction.dish.findFirst({
      where: {
        name: { equals: dish.name, mode: "insensitive" },
        ...(dish.id ? { id: { not: dish.id } } : {}),
      },
      select: { id: true },
    });
    if (nameCollision) throw new CatalogConflictError("A dish with that name already exists.");

    const recipeIngredients = ingredientIds.length > 0
      ? await transaction.ingredient.findMany({
          where: { id: { in: ingredientIds }, isActive: true },
          select: { id: true, unit: true },
        })
      : [];
    if (recipeIngredients.length !== ingredientIds.length) {
      throw new CatalogConflictError("Recipes can only use active ingredients from this business.");
    }

    const data = {
      name: dish.name,
      pricePaise: dish.pricePaise,
      gstRate: dish.gstRate,
      isActive: dish.isActive,
    };
    const savedDish = dish.id
      ? await transaction.dish.update({ where: { id: dish.id }, data })
      : await transaction.dish.create({ data: { tenantId: membership.tenantId, ...data } });

    if (dish.id) {
      await transaction.recipeLine.deleteMany({ where: { dishId: savedDish.id } });
    }

    if (dish.recipeLines.length > 0) {
      const unitsByIngredientId = new Map(recipeIngredients.map((ingredient) => [ingredient.id, ingredient.unit]));
      await transaction.recipeLine.createMany({
        data: dish.recipeLines.map((line) => ({
          tenantId: membership.tenantId,
          dishId: savedDish.id,
          ingredientId: line.ingredientId,
          quantityPerDish: line.quantityPerDish,
          unit: unitsByIngredientId.get(line.ingredientId)!,
        })),
      });
    }

    return savedDish;
  });
}

export async function archiveDishForMembership(membership: CatalogMembership, dishId: unknown) {
  assertCatalogEditor(membership);
  const id = parseCatalogId(dishId);
  const database = tenantDatabase(membership.tenantId);
  const result = await database.dish.updateMany({ where: { id }, data: { isActive: false } });
  if (result.count !== 1) throw new CatalogConflictError("That dish could not be found.");
}

export function recipeCostForDish(lines: { quantityPerDish: string; ingredient: { unitCostPaise: number } }[]): number {
  return calculateRecipeCostPaise(lines.map((line) => ({
    quantityPerDish: line.quantityPerDish,
    unitCostPaise: line.ingredient.unitCostPaise,
  })));
}

export function parseCatalogId(value: unknown): string {
  const parsed = ingredientFormSchema.shape.id.safeParse(value);
  if (!parsed.success || !parsed.data) throw new CatalogConflictError("That catalog item could not be found.");
  return parsed.data;
}