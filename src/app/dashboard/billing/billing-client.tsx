"use client";

import Script from "next/script";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { en } from "@/i18n/en";
import { createSubscriptionOrderAction, type SubscriptionCheckoutState } from "@/server/billing/subscription-actions";

type Plan = {
  id: string;
  name: string;
  periodDays: number;
  pricePaise: number;
  gstInclusive: boolean;
  gstRate: string;
  totalPaise: number;
  taxableAmountPaise: number;
};

type RazorpayCheckout = {
  open(): void;
  on(event: "payment.failed", callback: () => void): void;
};

declare global {
  interface Window {
    Razorpay?: new (options: {
      key: string;
      order_id: string;
      amount: number;
      currency: "INR";
      name: string;
      description: string;
      prefill: { name: string; email: string };
      handler: (_response: unknown) => void;
      modal: { ondismiss: () => void };
      theme: { color: string };
    }) => RazorpayCheckout;
  }
}

const initialState: SubscriptionCheckoutState = { status: "idle", message: "", checkout: null };
const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export function BillingClient({
  plans,
  tenantName,
  tenantGstin,
  owner,
  clientRequestKey,
}: {
  plans: Plan[];
  tenantName: string;
  tenantGstin: string | null;
  owner: boolean;
  clientRequestKey: string;
}) {
  const [state, action, pending] = useActionState(createSubscriptionOrderAction, initialState);
  const [selectedPlanId, setSelectedPlanId] = useState(plans[0]?.id ?? "");
  const [gstin, setGstin] = useState(tenantGstin ?? "");
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (!state.checkout || !scriptLoaded || !window.Razorpay) return;
    const checkout = state.checkout;
    const razorpay = new window.Razorpay({
      key: checkout.keyId,
      order_id: checkout.orderId,
      amount: checkout.amountPaise,
      currency: "INR",
      name: tenantName,
      description: en.billing.planDescription(checkout.planName),
      prefill: { name: checkout.buyerName, email: checkout.buyerEmail },
      handler: () => {
        setPaymentNotice(en.billing.verifyPayment);
      },
      modal: { ondismiss: () => setPaymentNotice(en.billing.attemptFailed) },
      theme: { color: "#14302a" },
    });
    razorpay.on("payment.failed", () => setPaymentNotice(en.billing.attemptFailed));
    razorpay.open();
  }, [state.checkout, scriptLoaded, tenantName]);

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" onLoad={() => setScriptLoaded(true)} onError={() => setPaymentNotice(en.billing.checkoutUnavailable)} />
      <section className="mt-8">
        <div className="border-b border-[#14302a]/15 pb-4"><p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#d6402b]">{en.billing.choosePlan}</p><h2 className="mt-2 text-2xl font-semibold text-[#14302a]">{en.billing.title}</h2><p className="mt-2 text-sm text-[#66736d]">{en.billing.gstCaNote}</p></div>
        {owner ? (
          <form action={action} className="mt-5">
            <input name="planId" type="hidden" value={selectedPlanId} />
            <input name="clientRequestKey" type="hidden" value={clientRequestKey} />
            <div className="grid gap-3 md:grid-cols-3">
              {plans.map((plan) => (
                <label className={`cursor-pointer rounded-md border p-4 transition-colors ${selectedPlanId === plan.id ? "border-[#14302a] bg-[#14302a] text-white" : "border-[#14302a]/15 bg-white text-[#14302a] hover:border-[#14302a]/50"}`} key={plan.id}>
                  <span className="flex items-start justify-between gap-3"><span className="text-lg font-semibold">{plan.name}</span><input checked={selectedPlanId === plan.id} className="mt-1 accent-[#e8b230]" onChange={() => setSelectedPlanId(plan.id)} type="radio" /></span>
                  <span className={`mt-2 block text-2xl font-semibold ${selectedPlanId === plan.id ? "text-white" : "text-[#14302a]"}`}>{currency.format(plan.totalPaise / 100)}</span>
                  <span className={`mt-1 block text-sm ${selectedPlanId === plan.id ? "text-white/75" : "text-[#66736d]"}`}>{en.billing.durationDays(plan.periodDays)} · {en.billing.gstRate(plan.gstRate)}</span>
                  <span className={`mt-2 block text-xs ${selectedPlanId === plan.id ? "text-white/75" : "text-[#66736d]"}`}>{plan.gstInclusive ? en.billing.gstIncluded : en.billing.gstAdded}</span>
                </label>
              ))}
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,24rem)_auto] sm:items-end">
              <label className="tk-field">{en.billing.gstinOptional}<input autoComplete="off" maxLength={15} name="gstin" onChange={(event) => setGstin(event.currentTarget.value.toUpperCase())} pattern="[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]" placeholder={en.billing.gstinPlaceholder} value={gstin} /></label>
              <button className="tk-button-primary" disabled={pending || !scriptLoaded || !selectedPlanId} type="submit">{pending ? en.billing.preparingCheckout : en.billing.checkout}</button>
            </div>
            {state.message ? <p aria-live="polite" className="mt-3 text-sm text-[#d6402b]" role="alert">{state.message}</p> : null}
            {paymentNotice ? <div aria-live="polite" className="mt-3 flex flex-wrap items-center gap-3 text-sm text-[#14302a]"><span>{paymentNotice}</span><button className="tk-button-secondary" onClick={() => router.refresh()} type="button">{en.billing.refreshStatus}</button></div> : null}
          </form>
        ) : <p className="mt-5 rounded-md border border-[#14302a]/10 bg-white p-4 text-sm text-[#66736d]">{en.billing.renewOwnerOnly}</p>}
      </section>
    </>
  );
}
