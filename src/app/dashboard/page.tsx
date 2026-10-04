import { activeMembershipForCurrentUser } from "@/server/auth/active-membership";
import { tenantDatabase } from "@/server/db/prisma";

export default async function DashboardPage() {
  const membership = await activeMembershipForCurrentUser();
  const database = tenantDatabase(membership.tenantId);
  const [ingredientCount, ingredients] = await Promise.all([
    database.ingredient.count(),
    database.ingredient.findMany({
      where: { isActive: true, reorderLevel: { not: null } },
      select: { id: true, name: true, currentStock: true, reorderLevel: true, unit: true },
    }),
  ]);
  const lowStock = ingredients.filter((ingredient) => ingredient.reorderLevel !== null && ingredient.currentStock.lte(ingredient.reorderLevel));

  return (
    <section>
      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#d6402b]">Workspace</p>
      <h1 className="mt-2 text-3xl font-semibold text-[#14302a]">{membership.tenant.name}</h1>
      <div className="mt-8 border-t border-[#14302a]/15 pt-6">
        <p className="text-sm text-[#66736d]">Ingredients</p>
        <p className="mt-1 text-2xl font-semibold text-[#14302a]">{ingredientCount}</p>
        {ingredientCount === 0 ? <p className="mt-2 text-sm text-[#66736d]">No ingredients have been added yet.</p> : null}
      </div>
      <div className="mt-8 border-t border-[#14302a]/15 pt-6">
        <h2 className="text-lg font-semibold text-[#14302a]">Low stock · {lowStock.length}</h2>
        {lowStock.length === 0 ? <p className="mt-2 text-sm text-[#66736d]">All active ingredients are above their reorder levels.</p> : (
          <ul className="mt-3 divide-y divide-[#14302a]/10">
            {lowStock.map((ingredient) => <li className="flex justify-between gap-3 py-2 text-sm" key={ingredient.id}><span>{ingredient.name}</span><strong className="text-[#d6402b]">{ingredient.currentStock.toString()} / {ingredient.reorderLevel?.toString()} {ingredient.unit.toLowerCase()}</strong></li>)}
          </ul>
        )}
      </div>
    </section>
  );
}