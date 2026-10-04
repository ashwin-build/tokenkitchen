import Link from "next/link";
import { cancelOrderAction, updateOrderStatusAction } from "@/server/billing/actions";

type OrderListItem = {
  id: string;
  tokenNo: number;
  invoiceNo: string;
  status: "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";
  totalPaise: number;
  paidPaise: number;
  balancePaise: number;
  stockShortage: boolean;
  partyName: string | null;
  createdAt: string;
  items: { name: string; quantity: string }[];
  payments: { mode: string; amountPaise: number; changePaise: number }[];
};

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const statusName = { PREPARING: "Preparing", READY: "Ready", COMPLETED: "Completed", CANCELLED: "Cancelled" } as const;

export function OrdersList({ orders, canCancel }: { orders: OrderListItem[]; canCancel: boolean }) {
  if (orders.length === 0) {
    return <div className="py-16 text-center"><h2 className="text-lg font-semibold text-[#14302a]">No orders for these filters</h2><p className="mt-2 text-sm text-[#66736d]">Change the date or clear a filter to see more.</p></div>;
  }

  return (
    <ul className="mt-5 divide-y divide-[#14302a]/10 border-y border-[#14302a]/10">
      {orders.map((order) => (
        <li className="grid gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center" key={order.id}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><h2 className="font-semibold text-[#14302a]">Token {order.tokenNo}</h2><span className="text-sm text-[#66736d]">{order.invoiceNo}</span><span className="text-sm font-semibold text-[#14302a]">{statusName[order.status]}</span>{order.stockShortage ? <span className="text-xs font-semibold text-[#d6402b]">Stock shortage</span> : null}</div>
            <p className="mt-1 truncate text-sm text-[#66736d]">{order.items.map((item) => `${item.quantity} × ${item.name}`).join(" · ")}</p>
            <p className="mt-1 text-xs text-[#66736d]">{new Date(order.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}{order.partyName ? ` · ${order.partyName}` : ""} · {order.payments.map((payment) => payment.mode).join(" + ") || "Credit"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <div className="mr-2 min-w-28 text-left lg:text-right"><p className="font-semibold text-[#18231f]">{currency.format(order.totalPaise / 100)}</p><p className={`text-xs ${order.balancePaise > 0 ? "font-semibold text-[#d6402b]" : "text-[#66736d]"}`}>{order.balancePaise > 0 ? `${currency.format(order.balancePaise / 100)} due` : "Paid"}</p></div>
            <Link className="tk-button-secondary" href={`/dashboard/orders/${order.id}/invoice`}>Invoice</Link>
            <Link className="tk-button-secondary" href={`/dashboard/orders/${order.id}/token`}>Token</Link>
            {order.status === "PREPARING" ? <form action={updateOrderStatusAction}><input name="orderId" type="hidden" value={order.id} /><input name="nextStatus" type="hidden" value="READY" /><button className="tk-button-primary" type="submit">Ready</button></form> : null}
            {order.status === "READY" ? <form action={updateOrderStatusAction}><input name="orderId" type="hidden" value={order.id} /><input name="nextStatus" type="hidden" value="COMPLETED" /><button className="tk-button-primary" type="submit">Complete</button></form> : null}
            {canCancel && order.status !== "CANCELLED" && order.status !== "COMPLETED" ? (
              <details className="relative">
                <summary className="tk-button-danger cursor-pointer list-none">Cancel</summary>
                <form action={cancelOrderAction} className="absolute right-0 top-12 z-10 w-72 rounded-md border border-[#14302a]/15 bg-white p-3 shadow-lg">
                  <input name="orderId" type="hidden" value={order.id} />
                  <label className="tk-field">Reason<input autoComplete="off" maxLength={500} minLength={3} name="reason" required /></label>
                  <button className="tk-button-danger mt-3 w-full" type="submit">Confirm cancel</button>
                </form>
              </details>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}