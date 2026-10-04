"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createBillAction, type BillActionState } from "@/server/billing/actions";
import { calculateBillLine, calculateInvoiceTotals } from "@/server/billing/calculations";

type CounterDish = {
  id: string;
  name: string;
  pricePaise: number;
  gstRate: number;
  recipe: { ingredientId: string; ingredientName: string; quantityPerDish: string; unit: string; currentStock: string; isActive: boolean }[];
};

type Customer = { id: string; name: string; phone: string | null };
type TenderMode = "CASH" | "UPI" | "CARD" | "BANK";
type CartLine = { dishId: string; quantity: string };
type TenderLine = { mode: TenderMode; amountRupees: string };

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const tenderLabels: Record<TenderMode, string> = { CASH: "Cash", UPI: "UPI", CARD: "Card", BANK: "Bank" };
const initialBillActionState: BillActionState = { status: "idle", message: "", order: null };

function paiseFromRupees(value: string): number {
  if (!/^\d+(?:\.\d{0,2})?$/.test(value)) return 0;
  const [whole, fraction = ""] = value.split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(paise) ? paise : 0;
}

function rupeesFromPaise(value: number): string {
  return (value / 100).toFixed(2);
}

export function CounterClient({
  dishes,
  customers,
  pricesIncludeGst,
  stockMode,
  idempotencyKey,
}: {
  dishes: CounterDish[];
  customers: Customer[];
  pricesIncludeGst: boolean;
  stockMode: "ENFORCE" | "WARN";
  idempotencyKey: string;
}) {
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [splitPayment, setSplitPayment] = useState(false);
  const [singleMode, setSingleMode] = useState<TenderMode>("CASH");
  const [tenders, setTenders] = useState<TenderLine[]>([{ mode: "CASH", amountRupees: "0.00" }]);
  const [customerChoice, setCustomerChoice] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [state, action, pending] = useActionState(createBillAction, initialBillActionState);

  const dishById = new Map(dishes.map((dish) => [dish.id, dish]));
  const calculatedLines = cart.flatMap((line) => {
    const dish = dishById.get(line.dishId);
    if (!dish) return [];
    return [calculateBillLine({
      dishId: dish.id,
      dishName: dish.name,
      unit: "portion",
      unitPricePaise: dish.pricePaise,
      gstRate: dish.gstRate,
      quantity: line.quantity,
    }, pricesIncludeGst)];
  });
  const totals = calculateInvoiceTotals(calculatedLines);
  const filteredDishes = dishes.filter((dish) => dish.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const selectedCustomer = customers.find((customer) => customer.id === customerChoice);

  function adjustQuantity(dishId: string, delta: number) {
    setCart((current) => {
      const existing = current.find((line) => line.dishId === dishId);
      if (!existing && delta > 0) return [...current, { dishId, quantity: String(delta) }];
      if (!existing) return current;
      const quantity = Math.max(0, Number(existing.quantity) + delta);
      return quantity === 0
        ? current.filter((line) => line.dishId !== dishId)
        : current.map((line) => line.dishId === dishId ? { ...line, quantity: String(quantity) } : line);
    });
  }

  function setCartQuantity(dishId: string, quantity: string) {
    if (quantity !== "" && (!/^\d+(?:\.\d{1,3})?$/.test(quantity) || Number(quantity) <= 0)) return;
    setCart((current) => current.map((line) => line.dishId === dishId ? { ...line, quantity } : line));
  }

  function addTender() {
    setTenders((current) => [...current, { mode: "UPI", amountRupees: "0.00" }]);
  }

  function makeBill(formData: FormData) {
    const tenderInput = splitPayment
      ? tenders.filter((tender) => paiseFromRupees(tender.amountRupees) > 0).map((tender) => ({ mode: tender.mode, amountPaise: paiseFromRupees(tender.amountRupees) }))
      : totals.totalPaise > 0 ? [{ mode: singleMode, amountPaise: totals.totalPaise }] : [];
    const customer = selectedCustomer
      ? { partyId: selectedCustomer.id }
      : customerChoice === "new" && customerName.trim()
        ? { name: customerName.trim(), phone: customerPhone.trim() || undefined }
        : undefined;
    formData.set("bill", JSON.stringify({
      idempotencyKey,
      items: cart.filter((line) => line.quantity !== "").map(({ dishId, quantity }) => ({ dishId, quantity })),
      customer,
      payments: tenderInput,
    }));
    return action(formData);
  }

  if (state.order) {
    return (
      <section aria-labelledby="bill-complete-title" className="mx-auto max-w-xl border-t-4 border-[#e8b230] bg-white p-6 sm:mt-8 sm:rounded-lg sm:border sm:border-[#14302a]/10 sm:border-t-4">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#d6402b]">Bill saved</p>
        <h1 className="mt-2 text-2xl font-semibold text-[#14302a]" id="bill-complete-title">Token {state.order.tokenNo}</h1>
        <p className="mt-2 text-sm text-[#66736d]">Invoice {state.order.invoiceNo} · {currency.format(state.order.totalPaise / 100)}</p>
        <p aria-live="polite" className="mt-3 text-sm text-[#14302a]">{state.message}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="tk-button-primary" href={`/dashboard/orders/${state.order.id}/token`} target="_blank">Print token</Link>
          <Link className="tk-button-secondary" href={`/dashboard/orders/${state.order.id}/invoice`} target="_blank">Invoice / Save PDF</Link>
          <button className="tk-button-secondary" onClick={() => window.location.reload()} type="button">New bill</button>
        </div>
      </section>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
      <section className="min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#14302a]/15 pb-4">
          <div><p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#d6402b]">Counter</p><h1 className="mt-2 text-3xl font-semibold text-[#14302a]">New bill</h1></div>
          <span className="text-sm text-[#66736d]">Prices {pricesIncludeGst ? "include" : "exclude"} GST · Stock {stockMode.toLowerCase()}</span>
        </div>
        <label className="tk-search mt-5"><span>Find a dish</span><input onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Search menu" type="search" value={search} /></label>
        {filteredDishes.length === 0 ? (
          <div className="py-16 text-center"><h2 className="text-lg font-semibold text-[#14302a]">{search ? "No dishes found" : "No active dishes"}</h2><p className="mt-2 text-sm text-[#66736d]">{search ? "Try a different search." : "Add active dishes to the menu before billing."}</p></div>
        ) : (
          <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filteredDishes.map((dish) => {
              const quantity = cart.find((line) => line.dishId === dish.id)?.quantity;
              return (
                <li key={dish.id}>
                  <button className={`flex min-h-28 w-full flex-col justify-between rounded-md border p-4 text-left transition-colors ${quantity ? "border-[#14302a] bg-[#14302a] text-white" : "border-[#14302a]/15 bg-white text-[#14302a] hover:border-[#14302a]/50"}`} onClick={() => adjustQuantity(dish.id, 1)} type="button">
                    <span className="font-semibold leading-5">{dish.name}</span>
                    <span className={`mt-3 text-sm ${quantity ? "text-white/75" : "text-[#66736d]"}`}>{currency.format(dish.pricePaise / 100)} · GST {dish.gstRate}%</span>
                    {quantity ? <span className="mt-2 text-xs font-semibold">In cart: {quantity}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside className="h-fit rounded-md border border-[#14302a]/15 bg-white p-4 sm:p-5 xl:sticky xl:top-4">
        <h2 className="text-xl font-semibold text-[#14302a]">Current bill</h2>
        {cart.length === 0 ? <p className="py-8 text-center text-sm text-[#66736d]">Choose dishes to begin.</p> : (
          <ul className="mt-3 divide-y divide-[#14302a]/10">
            {cart.map((line) => {
              const dish = dishById.get(line.dishId)!;
              return (
                <li className="flex items-center justify-between gap-3 py-3" key={line.dishId}>
                  <div className="min-w-0"><p className="truncate text-sm font-semibold text-[#18231f]">{dish.name}</p><p className="mt-1 text-xs text-[#66736d]">{currency.format(dish.pricePaise / 100)} each</p></div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button aria-label={`Decrease ${dish.name} quantity`} className="tk-quantity-button" onClick={() => adjustQuantity(dish.id, -1)} type="button">−</button>
                    <input aria-label={`${dish.name} quantity`} className="tk-quantity-input" inputMode="decimal" onChange={(event) => setCartQuantity(dish.id, event.currentTarget.value)} value={line.quantity} />
                    <button aria-label={`Increase ${dish.name} quantity`} className="tk-quantity-button" onClick={() => adjustQuantity(dish.id, 1)} type="button">+</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-2 space-y-1 border-t border-[#14302a]/10 pt-3 text-sm">
          <p className="flex justify-between text-[#66736d]"><span>Taxable value</span><span>{currency.format(totals.subtotalPaise / 100)}</span></p>
          <p className="flex justify-between text-[#66736d]"><span>CGST + SGST</span><span>{currency.format((totals.cgstPaise + totals.sgstPaise) / 100)}</span></p>
          <p className="flex justify-between text-[#66736d]"><span>Round-off</span><span>{currency.format(totals.roundOffPaise / 100)}</span></p>
          <p className="flex justify-between pt-2 text-lg font-semibold text-[#14302a]"><span>Total</span><span>{currency.format(totals.totalPaise / 100)}</span></p>
        </div>

        <div className="mt-5 space-y-3">
          <label className="tk-field">Customer<select onChange={(event) => setCustomerChoice(event.currentTarget.value)} value={customerChoice}><option value="">Walk-in customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ""}</option>)}<option value="new">Add customer</option></select></label>
          {customerChoice === "new" ? <div className="grid gap-3 sm:grid-cols-2"><label className="tk-field">Name<input autoComplete="name" maxLength={120} onChange={(event) => setCustomerName(event.currentTarget.value)} value={customerName} /></label><label className="tk-field">Phone<input autoComplete="tel" inputMode="tel" maxLength={32} onChange={(event) => setCustomerPhone(event.currentTarget.value)} value={customerPhone} /></label></div> : null}

          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-[#18231f]">Payment</h3>
            <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-[#14302a]"><input checked={splitPayment} onChange={(event) => { setSplitPayment(event.currentTarget.checked); setTenders([{ mode: "CASH", amountRupees: rupeesFromPaise(totals.totalPaise) }]); }} type="checkbox" />Split payment</label>
          </div>
          {splitPayment ? (
            <div className="space-y-3">
              {tenders.map((tender, index) => (
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem] gap-2" key={index}>
                  <label className="tk-field"><span className="sr-only">Payment mode</span><select aria-label="Payment mode" onChange={(event) => setTenders(tenders.map((item, row) => row === index ? { ...item, mode: event.currentTarget.value as TenderMode } : item))} value={tender.mode}>{Object.entries(tenderLabels).map(([mode, label]) => <option key={mode} value={mode}>{label}</option>)}</select></label>
                  <label className="tk-field"><span className="sr-only">Amount in rupees</span><input aria-label="Amount in rupees" inputMode="decimal" onChange={(event) => setTenders(tenders.map((item, row) => row === index ? { ...item, amountRupees: event.currentTarget.value } : item))} placeholder="0.00" value={tender.amountRupees} /></label>
                  <button aria-label="Remove payment" className="tk-button-secondary px-0" disabled={tenders.length === 1} onClick={() => setTenders(tenders.filter((_, row) => row !== index))} type="button">×</button>
                </div>
              ))}
              <button className="tk-button-secondary" onClick={addTender} type="button">Add payment</button>
            </div>
          ) : (
            <div aria-label="Payment mode" className="grid grid-cols-4 gap-1 rounded-md bg-[#f5f4ef] p-1" role="group">
              {Object.entries(tenderLabels).map(([mode, label]) => <button aria-pressed={singleMode === mode} className={`min-h-10 rounded text-sm font-semibold ${singleMode === mode ? "bg-[#14302a] text-white" : "text-[#14302a]"}`} key={mode} onClick={() => setSingleMode(mode as TenderMode)} type="button">{label}</button>)}
            </div>
          )}
        </div>

        <form action={makeBill} className="mt-5">
          <input name="bill" type="hidden" value="" />
          <button className="tk-button-primary w-full" disabled={pending || cart.length === 0 || !idempotencyKey} type="submit">{pending ? "Saving bill…" : "Create bill"}</button>
          {state.message ? <p aria-live="polite" className={`mt-3 whitespace-pre-line text-sm ${state.status === "error" ? "text-[#d6402b]" : "text-[#14302a]"}`} role={state.status === "error" ? "alert" : undefined}>{state.message}</p> : null}
        </form>
      </aside>
    </div>
  );
}