import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/app/dashboard/orders/print-button";
import { en } from "@/i18n/en";
import { getSubscriptionInvoice } from "@/server/billing/queries";
import { RazorpayConfigurationError, sellerInvoiceDetails } from "@/server/billing/razorpay-config";

export const dynamic = "force-dynamic";

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export default async function SubscriptionInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getSubscriptionInvoice(id);
  if (!data) notFound();

  let seller: ReturnType<typeof sellerInvoiceDetails>;
  try {
    seller = sellerInvoiceDetails();
  } catch (error) {
    if (!(error instanceof RazorpayConfigurationError)) throw error;
    return <p className="p-8 text-sm text-[#d6402b]">{en.billing.sellerSetup}</p>;
  }

  const { invoice } = data;
  return (
    <article className="invoice-document mx-auto max-w-3xl bg-white p-5 sm:my-8 sm:rounded-md sm:border sm:border-[#14302a]/10 sm:p-8" data-print-document>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link className="tk-button-secondary" href="/dashboard/billing">{en.common.back}</Link>
        <PrintButton>{en.billing.printPdf}</PrintButton>
      </div>
      <header className="border-b border-[#14302a]/20 pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#66736d]">{en.billing.invoice}</p>
        <h1 className="mt-2 text-2xl font-semibold text-[#14302a]">{seller.name}</h1>
        <p className="mt-1 whitespace-pre-line text-sm text-[#66736d]">{seller.address}</p>
        <p className="mt-1 text-sm text-[#66736d]">GSTIN: {seller.gstin}</p>
      </header>
      <section className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
        <p><strong>{en.billing.invoiceNumber}:</strong> {invoice.invoiceNumber}</p>
        <p><strong>{en.billing.invoiceDate}:</strong> {new Date(invoice.paidAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" })}</p>
        <p><strong>{en.billing.buyer}:</strong> {invoice.buyerBusinessName}</p>
        {invoice.buyerGstin ? <p><strong>{en.billing.gstin}:</strong> {invoice.buyerGstin}</p> : null}
        <p><strong>{en.billing.planName}:</strong> {invoice.planName}</p>
      </section>
      <section className="ml-auto mt-8 max-w-sm space-y-2 text-sm">
        <p className="flex justify-between"><span>{en.billing.invoiceSubtotal}</span><span>{currency.format(invoice.taxableAmountPaise / 100)}</span></p>
        <p className="flex justify-between"><span>{en.billing.cgst}</span><span>{currency.format(invoice.cgstPaise / 100)}</span></p>
        <p className="flex justify-between"><span>{en.billing.sgst}</span><span>{currency.format(invoice.sgstPaise / 100)}</span></p>
        <p className="flex justify-between border-t border-[#14302a]/20 pt-3 text-lg font-semibold"><span>{en.billing.total}</span><span>{currency.format(invoice.totalPaise / 100)}</span></p>
      </section>
    </article>
  );
}