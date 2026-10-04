import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/app/dashboard/orders/print-button";
import { getOrderPrintData } from "@/server/billing/queries";

export const dynamic = "force-dynamic";

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getOrderPrintData(id);
  if (!data) notFound();
  const { tenant, order } = data;

  return (
    <article className="invoice-document mx-auto max-w-3xl bg-white p-5 sm:my-8 sm:rounded-md sm:border sm:border-[#14302a]/10 sm:p-8" data-print-document>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link className="tk-button-secondary" href="/dashboard/orders">Back to orders</Link>
        <PrintButton>Print / Save PDF</PrintButton>
      </div>
      {order.status === "CANCELLED" ? <p className="mb-4 border border-[#d6402b] p-3 text-center font-semibold uppercase text-[#d6402b]">Cancelled · {order.cancelReason}</p> : null}
      <header className="border-b border-[#14302a]/20 pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#66736d]">Tax invoice</p>
        <h1 className="mt-2 text-2xl font-semibold text-[#14302a]">{tenant.name}</h1>
        {tenant.gstin ? <p className="mt-1 text-sm text-[#66736d]">GSTIN: {tenant.gstin}</p> : null}
        <div className="mt-4 grid gap-1 text-sm sm:grid-cols-2">
          <p><strong>Invoice:</strong> {order.invoiceNo}</p>
          <p><strong>Date:</strong> {new Date(order.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
          <p><strong>Token:</strong> {order.tokenNo}</p>
          {order.party ? <p><strong>Customer:</strong> {order.party.name}{order.party.gstin ? ` · GSTIN ${order.party.gstin}` : ""}</p> : null}
        </div>
      </header>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[38rem] border-collapse text-left text-xs sm:text-sm">
          <thead><tr className="border-b border-[#14302a]/20 text-[#66736d]"><th className="py-2 pr-3">Item</th><th className="py-2 pr-3 text-right">Qty</th><th className="py-2 pr-3 text-right">Rate</th><th className="py-2 pr-3 text-right">Taxable</th><th className="py-2 pr-3 text-right">GST</th><th className="py-2 text-right">Amount</th></tr></thead>
          <tbody>
            {order.items.map((item, index) => (
              <tr className="border-b border-[#14302a]/10" key={`${item.dishName}-${index}`}>
                <td className="py-2 pr-3">{item.dishName}<span className="block text-xs text-[#66736d]">GST {item.gstRate}% · CGST {currency.format(item.cgstPaise / 100)} · SGST {currency.format(item.sgstPaise / 100)}</span></td>
                <td className="py-2 pr-3 text-right">{item.quantity} {item.unit}</td>
                <td className="py-2 pr-3 text-right">{currency.format(item.unitPricePaise / 100)}</td>
                <td className="py-2 pr-3 text-right">{currency.format(item.taxableAmountPaise / 100)}</td>
                <td className="py-2 pr-3 text-right">{currency.format((item.cgstPaise + item.sgstPaise) / 100)}</td>
                <td className="py-2 text-right">{currency.format(item.totalPaise / 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="ml-auto mt-5 max-w-sm space-y-2 text-sm">
        <p className="flex justify-between"><span>Taxable value</span><span>{currency.format(order.subtotalPaise / 100)}</span></p>
        <p className="flex justify-between"><span>CGST</span><span>{currency.format(order.cgstPaise / 100)}</span></p>
        <p className="flex justify-between"><span>SGST</span><span>{currency.format(order.sgstPaise / 100)}</span></p>
        <p className="flex justify-between"><span>Round-off</span><span>{currency.format(order.roundOffPaise / 100)}</span></p>
        <p className="flex justify-between border-t border-[#14302a]/20 pt-2 text-lg font-semibold"><span>Total</span><span>{currency.format(order.totalPaise / 100)}</span></p>
        <div className="border-t border-[#14302a]/10 pt-2">
          <p className="mb-1 font-semibold">Payments</p>
          {order.payments.length === 0 ? <p className="text-[#66736d]">No payments received</p> : order.payments.map((payment, index) => <p className="flex justify-between" key={`${payment.mode}-${index}`}><span>{payment.mode.replaceAll("_", " ")}</span><span>{currency.format(payment.amountPaise / 100)}{payment.changePaise ? ` · change ${currency.format(payment.changePaise / 100)}` : ""}</span></p>)}
        </div>
        <p className={`flex justify-between border-t border-[#14302a]/10 pt-2 font-semibold ${order.balancePaise > 0 ? "text-[#d6402b]" : ""}`}><span>Balance due</span><span>{currency.format(order.balancePaise / 100)}</span></p>
      </section>
      <footer className="mt-8 border-t border-[#14302a]/10 pt-4 text-center text-xs text-[#66736d]">Thank you</footer>
    </article>
  );
}