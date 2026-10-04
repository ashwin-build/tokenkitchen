import Link from "next/link";
import { listStockMovements } from "@/server/inventory/queries";

export const dynamic = "force-dynamic";

const movementTypes = ["OPENING", "PURCHASE", "SALE", "WASTAGE", "SPOILAGE", "ADJUSTMENT", "RETURN"] as const;

export default async function MovementLogPage({
  searchParams,
}: {
  searchParams: Promise<{ ingredientId?: string; type?: string; from?: string; to?: string }>;
}) {
  const filters = await searchParams;
  const data = await listStockMovements(filters);

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#14302a]/15 pb-5">
        <div><p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#d6402b]">Stock</p><h1 className="mt-2 text-3xl font-semibold text-[#14302a]">Movement log</h1></div>
        <Link className="tk-button-secondary" href="/dashboard/inventory">Inventory</Link>
      </div>
      <form className="mt-5 grid gap-3 rounded-md border border-[#14302a]/10 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4" method="get">
        <label className="tk-field">Ingredient<select defaultValue={data.filters.ingredientId ?? ""} name="ingredientId"><option value="">All ingredients</option>{data.ingredients?.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}</select></label>
        <label className="tk-field">Movement type<select defaultValue={data.filters.type ?? ""} name="type"><option value="">All types</option>{movementTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ").toLowerCase()}</option>)}</select></label>
        <label className="tk-field">From<input defaultValue={data.filters.from ?? ""} name="from" type="date" /></label>
        <label className="tk-field">To<input defaultValue={data.filters.to ?? ""} name="to" type="date" /></label>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
          <button className="tk-button-primary" type="submit">Filter movements</button>
          <Link className="tk-button-secondary" href="/dashboard/inventory/movements">Clear</Link>
        </div>
      </form>
      <form action="/api/inventory/movements" className="mt-3" method="get">
        <input name="ingredientId" type="hidden" value={data.filters.ingredientId ?? ""} />
        <input name="type" type="hidden" value={data.filters.type ?? ""} />
        <input name="from" type="hidden" value={data.filters.from ?? ""} />
        <input name="to" type="hidden" value={data.filters.to ?? ""} />
        <button className="tk-button-secondary" type="submit">Export CSV</button>
      </form>
      {data.error ? <p className="mt-4 text-sm text-[#d6402b]" role="alert">{data.error}</p> : null}
      {data.movements.length === 0 ? <p className="py-16 text-center text-sm text-[#66736d]">No stock movements match these filters.</p> : (
        <div className="mt-5 overflow-x-auto rounded-md border border-[#14302a]/10 bg-white">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead><tr className="border-b border-[#14302a]/10 bg-[#f5f4ef] text-xs uppercase text-[#66736d]"><th className="px-3 py-3">Date</th><th className="px-3 py-3">Ingredient</th><th className="px-3 py-3">Type</th><th className="px-3 py-3 text-right">Change</th><th className="px-3 py-3">Source / reason</th></tr></thead>
            <tbody>
              {data.movements.map((movement) => (
                <tr className="border-b border-[#14302a]/10 last:border-0" key={movement.id}>
                  <td className="whitespace-nowrap px-3 py-3 text-[#66736d]">{new Date(movement.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                  <td className="px-3 py-3 font-medium text-[#18231f]">{movement.ingredientName}</td>
                  <td className="px-3 py-3">{movement.type.replaceAll("_", " ").toLowerCase()}</td>
                  <td className={`px-3 py-3 text-right font-semibold ${movement.quantityDelta.startsWith("-") ? "text-[#d6402b]" : "text-[#14302a]"}`}>{movement.quantityDelta} {movement.unit}</td>
                  <td className="max-w-64 truncate px-3 py-3 text-[#66736d]">{movement.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}