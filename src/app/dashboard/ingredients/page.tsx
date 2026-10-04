import { currentCatalogMembership } from "@/server/catalog/access";
import { listIngredients } from "@/server/catalog/queries";
import { IngredientCatalog } from "@/app/dashboard/catalog-client";

export const dynamic = "force-dynamic";

export default async function IngredientsPage() {
  const [membership, ingredients] = await Promise.all([
    currentCatalogMembership(),
    listIngredients(),
  ]);

  return <IngredientCatalog items={ingredients} canEdit={membership.role !== "CASHIER"} />;
}