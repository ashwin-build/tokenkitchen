import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { activeMembershipForCurrentUser } from "@/server/auth/active-membership";
import { switchBusinessAction } from "@/server/auth/business-actions";
import { membershipsForClerkUser } from "@/server/db/membership-access";
import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const membership = await activeMembershipForCurrentUser();
  const { userId } = await auth();
  const memberships = userId ? await membershipsForClerkUser(userId) : [];

  return (
    <div className="min-h-screen bg-[#f5f4ef]">
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-[#14302a]/10 bg-white px-4 py-3 sm:px-6">
        <Link className="font-semibold text-[#14302a]" href="/dashboard">TokenKitchen</Link>
        <div className="flex items-center gap-3">
          {memberships.length > 1 ? (
            <form action={switchBusinessAction} className="flex items-center gap-2">
              <label className="sr-only" htmlFor="tenantId">Business</label>
              <select
                className="min-h-11 max-w-48 rounded-md border border-[#14302a]/20 bg-white px-3 text-sm"
                defaultValue={membership.tenantId}
                id="tenantId"
                name="tenantId"
              >
                {memberships.map((item) => (
                  <option key={item.tenantId} value={item.tenantId}>{item.tenant.name}</option>
                ))}
              </select>
              <button className="min-h-11 rounded-md bg-[#14302a] px-3 text-sm font-semibold text-white" type="submit">
                Switch
              </button>
            </form>
          ) : (
            <span className="max-w-40 truncate text-sm font-medium text-[#66736d]">{membership.tenant.name}</span>
          )}
          <UserButton />
        </div>
      </header>
      <nav aria-label="Main navigation" className="flex min-h-12 items-center gap-1 border-b border-[#14302a]/10 bg-white px-4 sm:px-6">
        <Link className="rounded-md px-3 py-2 text-sm font-medium text-[#14302a] hover:bg-[#f5f4ef]" href="/dashboard">Overview</Link>
        <Link className="rounded-md px-3 py-2 text-sm font-medium text-[#14302a] hover:bg-[#f5f4ef]" href="/dashboard/ingredients">Ingredients</Link>
        <Link className="rounded-md px-3 py-2 text-sm font-medium text-[#14302a] hover:bg-[#f5f4ef]" href="/dashboard/dishes">Dishes</Link>
        <Link className="rounded-md px-3 py-2 text-sm font-medium text-[#14302a] hover:bg-[#f5f4ef]" href="/dashboard/inventory">Inventory</Link>
        <Link className="rounded-md px-3 py-2 text-sm font-medium text-[#14302a] hover:bg-[#f5f4ef]" href="/dashboard/counter">Counter</Link>
        <Link className="rounded-md px-3 py-2 text-sm font-medium text-[#14302a] hover:bg-[#f5f4ef]" href="/dashboard/orders">Orders</Link>
        <Link className="rounded-md px-3 py-2 text-sm font-medium text-[#14302a] hover:bg-[#f5f4ef]" href="/dashboard/settings">Settings</Link>
        <Link className="rounded-md px-3 py-2 text-sm font-medium text-[#14302a] hover:bg-[#f5f4ef]" href="/dashboard/billing">Billing</Link>
      </nav>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}