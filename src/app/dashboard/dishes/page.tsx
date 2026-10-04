import { currentCatalogMembership } from "@/server/catalog/access";
import { listActiveIngredientsForRecipes, listDishes } from "@/server/catalog/queries";
import { DishCatalog } from "@/app/dashboard/catalog-client";

export const dynamic = "force-dynamic";

export default async function DishesPage() {
  const [membership, dishes, ingredients] = await Promise.all([
    currentCatalogMembership(),
    listDishes(),
    listActiveIngredientsForRecipes(),
  ]);

  return <DishCatalog items={dishes} ingredients={ingredients} canEdit={membership.role !== "CASHIER"} />;
}