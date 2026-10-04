import { currentBillingMembership } from "@/server/billing/access";
import { updatePricesIncludeGstAction, updateStockModeAction } from "@/server/billing/actions";
import { tenantDatabase } from "@/server/db/prisma";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const membership = await currentBillingMembership();
  const tenant = await tenantDatabase(membership.tenantId).tenant.findUniqueOrThrow({ where: { id: membership.tenantId } });

  return (
    <section className="max-w-3xl">
      <div className="border-b border-[#14302a]/15 pb-5"><p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#d6402b]">Business</p><h1 className="mt-2 text-3xl font-semibold text-[#14302a]">Settings</h1></div>
      {membership.role !== "OWNER" ? <p className="mt-6 text-sm text-[#66736d]">Only the business owner can change billing and stock settings.</p> : (
        <div className="divide-y divide-[#14302a]/10">
          <form action={updatePricesIncludeGstAction} className="flex flex-col gap-4 py-6 sm:flex-row sm:items-end sm:justify-between">
            <div><h2 className="font-semibold text-[#14302a]">Menu prices and GST</h2><p className="mt-1 text-sm text-[#66736d]">Choose whether the menu price already includes GST.</p></div>
            <div className="flex items-end gap-3"><label className="tk-field">Price setting<select defaultValue={String(tenant.pricesIncludeGst)} name="pricesIncludeGst"><option value="true">GST included</option><option value="false">GST added</option></select></label><button className="tk-button-primary" type="submit">Save</button></div>
          </form>
          <form action={updateStockModeAction} className="flex flex-col gap-4 py-6 sm:flex-row sm:items-end sm:justify-between">
            <div><h2 className="font-semibold text-[#14302a]">Stock mode</h2><p className="mt-1 text-sm text-[#66736d]">Enforce blocks a bill with insufficient ingredients. Warn allows it and flags the order.</p></div>
            <div className="flex items-end gap-3"><label className="tk-field">Stock behavior<select defaultValue={tenant.stockMode} name="stockMode"><option value="ENFORCE">Enforce</option><option value="WARN">Warn</option></select></label><button className="tk-button-primary" type="submit">Save</button></div>
          </form>
        </div>
      )}
    </section>
  );
}