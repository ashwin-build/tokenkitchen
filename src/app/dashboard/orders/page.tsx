import Link from "next/link";
import { listOrders } from "@/server/billing/queries";
import { OrdersList } from "@/app/dashboard/orders/orders-list";

export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; status?: string; paymentState?: string; search?: string }>;
}) {
  const filters = await searchParams;
  const data = await listOrders(filters);

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#14302a]/15 pb-5">
        <div><p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#d6402b]">Counter service</p><h1 className="mt-2 text-3xl font-semibold text-[#14302a]">Orders</h1></div>
        <Link className="tk-button-primary" href="/dashboard/counter">New bill</Link>
      </div>
      <form className="mt-5 grid gap-3 rounded-md border border-[#14302a]/10 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4" method="get">
        <label className="tk-field">Business date<input defaultValue={data.date} name="date" type="date" /></label>
        <label className="tk-field">Status<select defaultValue={filters.status ?? "all"} name="status"><option value="all">All statuses</option><option value="PREPARING">Preparing</option><option value="READY">Ready</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select></label>
        <label className="tk-field">Payment<select defaultValue={filters.paymentState ?? "all"} name="paymentState"><option value="all">All payments</option><option value="paid">Paid</option><option value="due">Balance due</option></select></label>
        <label className="tk-field">Token or invoice<input defaultValue={filters.search ?? ""} maxLength={100} name="search" placeholder="Search order number" /></label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4"><button className="tk-button-primary" type="submit">Apply filters</button><Link className="tk-button-secondary" href="/dashboard/orders">Today</Link></div>
      </form>
      <OrdersList orders={data.orders} canCancel={data.membership.role === "OWNER" || data.membership.role === "MANAGER"} />
    </section>
  );
}