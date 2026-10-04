import { randomUUID } from "node:crypto";
import Link from "next/link";
import { BillingClient } from "@/app/dashboard/billing/billing-client";
import { en } from "@/i18n/en";
import { getBillingPageData } from "@/server/billing/queries";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const data = await getBillingPageData();
  const owner = data.membership.role === "OWNER";
  const currentLabel = !data.current.active
    ? en.billing.statusExpired
    : data.current.status === "TRIALING"
      ? en.billing.statusTrial
      : en.billing.statusActive;
  const endLabel = data.current.status === "TRIALING" ? en.billing.trialEnds : en.billing.planEnds;
  const showExpiryNotice = data.current.active && data.current.daysRemaining <= 7;

  return (
    <section>
      <div className="border-b border-[#14302a]/15 pb-5">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#d6402b]">{en.billing.title}</p>
        <h1 className="mt-2 text-3xl font-semibold text-[#14302a]">{data.tenant.name}</h1>
      </div>

      {!data.current.active ? (
        <div className="mt-5 border-l-4 border-[#d6402b] bg-white p-4" role="status">
          <h2 className="font-semibold text-[#d6402b]">{en.billing.expiredTitle}</h2>
          <p className="mt-1 text-sm text-[#66736d]">{en.billing.expiredBody}</p>
        </div>
      ) : showExpiryNotice ? (
        <div className="mt-5 border-l-4 border-[#e8b230] bg-white p-4" role="status">
          <p className="text-sm font-semibold text-[#14302a]">{en.billing.expiresSoon(data.current.daysRemaining)}</p>
        </div>
      ) : null}

      <section className="mt-5 border-y border-[#14302a]/10 py-5" aria-label={en.billing.currentPlan}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="font-semibold text-[#14302a]">{en.billing.currentPlan}</h2><p className="mt-1 text-sm text-[#66736d]">{data.current.planName ?? en.billing.trial}</p></div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${data.current.active ? "bg-[#e8b230]/20 text-[#14302a]" : "bg-[#d6402b]/10 text-[#d6402b]"}`}>{currentLabel}</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <p><span className="text-[#66736d]">{endLabel}: </span><strong>{data.current.endAt ? new Date(data.current.endAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" }) : en.billing.noEndDate}</strong></p>
          {data.current.active ? <p className="font-semibold text-[#14302a]">{en.billing.daysRemaining(data.current.daysRemaining)}</p> : null}
        </div>
      </section>

      <BillingClient
        plans={data.plans}
        tenantName={data.tenant.name}
        tenantGstin={data.tenant.gstin}
        owner={owner}
        clientRequestKey={randomUUID()}
      />

      <section className="mt-10 border-t border-[#14302a]/15 pt-6">
        <h2 className="text-lg font-semibold text-[#14302a]">{en.billing.invoices}</h2>
        {data.invoices.length === 0 ? <p className="mt-3 text-sm text-[#66736d]">{en.billing.noInvoices}</p> : (
          <ul className="mt-3 divide-y divide-[#14302a]/10">
            {data.invoices.map((invoice) => <li className="flex flex-wrap items-center justify-between gap-3 py-3" key={invoice.id}><div><p className="font-medium text-[#18231f]">{invoice.invoiceNumber}</p><p className="text-xs text-[#66736d]">{new Date(invoice.paidAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" })}</p></div><div className="flex items-center gap-3"><strong>{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(invoice.totalPaise / 100)}</strong><Link className="tk-button-secondary" href={`/dashboard/billing/invoices/${invoice.id}`}>{en.billing.viewInvoice}</Link></div></li>)}
          </ul>
        )}
      </section>
    </section>
  );
}
