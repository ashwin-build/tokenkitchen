import { tenantDatabase } from "@/server/db/prisma";
import { currentCatalogMembership } from "@/server/catalog/access";
import { recipeCostForDish } from "@/server/catalog/services";

const unitFromDatabase = {
  KG: "kg",
  G: "g",
  L: "L",
  ML: "ml",
  PCS: "pcs",
} as const;

export async function listIngredients() {
  const membership = await currentCatalogMembership();
  const ingredients = await tenantDatabase(membership.tenantId).ingredient.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  return ingredients.map((ingredient) => ({
    id: ingredient.id,
    name: ingredient.name,
    unit: unitFromDatabase[ingredient.unit],
    currentQuantity: ingredient.currentStock.toString(),
    reorderLevel: ingredient.reorderLevel?.toString() ?? "",
    costPerUnitPaise: ingredient.unitCostPaise,
    active: ingredient.isActive,
  }));
}

export async function listDishes() {
  const membership = await currentCatalogMembership();
  const dishes = await tenantDatabase(membership.tenantId).dish.findMany({
    include: {
      recipeLines: {
        include: {
          ingredient: { select: { id: true, name: true, unit: true, unitCostPaise: true, isActive: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  return dishes.map((dish) => ({
    id: dish.id,
    name: dish.name,
    pricePaise: dish.pricePaise,
    gstRate: dish.gstRate,
    active: dish.isActive,
    foodCostPaise: recipeCostForDish(dish.recipeLines.map((line) => ({
      quantityPerDish: line.quantityPerDish.toString(),
      ingredient: line.ingredient,
    }))),
    recipeLines: dish.recipeLines.map((line) => ({
      ingredientId: line.ingredientId,
      ingredientName: line.ingredient.name,
      quantityPerDish: line.quantityPerDish.toString(),
      unit: unitFromDatabase[line.unit],
      unitCostPaise: line.ingredient.unitCostPaise,
      ingredientActive: line.ingredient.isActive,
    })),
  }));
}

export async function listActiveIngredientsForRecipes() {
  const membership = await currentCatalogMembership();
  const ingredients = await tenantDatabase(membership.tenantId).ingredient.findMany({
    where: { isActive: true },
    select: { id: true, name: true, unit: true },
    orderBy: { name: "asc" },
  });
  return ingredients.map((ingredient) => ({
    id: ingredient.id,
    name: ingredient.name,
    unit: unitFromDatabase[ingredient.unit],
  }));
}