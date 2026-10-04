"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { adjustStockAction, createPurchaseAction, initialInventoryActionState, type InventoryActionState } from "@/server/inventory/actions";
import { calculatePurchaseLinePaise } from "@/server/inventory/purchase-math";

type Ingredient = {
  id: string;
  name: string;
  unit: string;
  currentQuantity: string;
  reorderLevel: string | null;
  unitCostPaise: number;
  active: boolean;
};

type Supplier = { id: string; name: string; phone: string | null };
type PurchaseLineDraft = { ingredientId: string; quantity: string; unitCostPaise: string };
type AdjustmentKind = "WASTAGE" | "SPOILAGE" | "COUNT";

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

function Message({ state }: { state: InventoryActionState }) {
  if (!state.message) return null;
  return <p aria-live="polite" className={`text-sm ${state.status === "error" ? "text-[#d6402b]" : "text-[#14302a]"}`} role={state.status === "error" ? "alert" : undefined}>{state.message}</p>;
}

function rupeesToPaise(value: string): number {
  if (!/^\d+(?:\.\d{0,2})?$/.test(value)) return 0;
  const [rupees, fraction = ""] = value.split(".");
  return Number(rupees) * 100 + Number(fraction.padEnd(2, "0"));
}

function PurchaseForm({ ingredients, suppliers, idempotencyKey }: { ingredients: Ingredient[]; suppliers: Supplier[]; idempotencyKey: string }) {
  const [state, action, pending] = useActionState(createPurchaseAction, initialInventoryActionState);
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [lines, setLines] = useState<PurchaseLineDraft[]>([{ ingredientId: "", quantity: "1", unitCostPaise: "0" }]);
  const [paidNowRupees, setPaidNowRupees] = useState("0.00");
  const [paymentMode, setPaymentMode] = useState("CASH");
  const purchaseKey = idempotencyKey;

  if (state.purchase) {
    return (
      <section className="border-t-4 border-[#e8b230] bg-white p-5 sm:rounded-md sm:border sm:border-[#14302a]/10 sm:border-t-4">
        <h2 className="text-lg font-semibold text-[#14302a]">Purchase saved</h2>
        <p className="mt-2 text-sm text-[#66736d]">{state.purchase.supplierName} · {currency.format(state.purchase.totalPaise / 100)} total · {currency.format(state.purchase.balancePaise / 100)} due</p>
        <div className="mt-4 flex flex-wrap gap-2"><Link className="tk-button-secondary" href="/dashboard/inventory/movements">View movements</Link><button className="tk-button-primary" onClick={() => window.location.reload()} type="button">New purchase</button></div>
      </section>
    );
  }

  const totalPaise = lines.reduce((sum, line) => {
    if (!line.ingredientId || !/^\d+(?:\.\d{1,3})?$/.test(line.quantity) || !/^\d+$/.test(line.unitCostPaise)) return sum;
    try {
      return sum + calculatePurchaseLinePaise({ quantity: line.quantity, unitCostPaise: Number(line.unitCostPaise) });
    } catch {
      return sum;
    }
  }, 0);

  function addLine() {
    setLines([...lines, { ingredientId: "", quantity: "1", unitCostPaise: "0" }]);
  }

  function submitPurchase(formData: FormData) {
    const supplier = supplierId
      ? { partyId: supplierId }
      : { name: supplierName.trim(), phone: supplierPhone.trim() || undefined };
    formData.set("purchase", JSON.stringify({
      idempotencyKey: purchaseKey,
      supplier,
      lines: lines.filter((line) => line.ingredientId).map((line) => ({ ...line, unitCostPaise: line.unitCostPaise || "0" })),
      paidNowPaise: String(rupeesToPaise(paidNowRupees)),
      paymentMode: rupeesToPaise(paidNowRupees) > 0 ? paymentMode : undefined,
    }));
    return action(formData);
  }

  return (
    <section className="rounded-md border border-[#14302a]/12 bg-white p-4 sm:p-5">
      <div className="border-b border-[#14302a]/10 pb-3"><h2 className="text-lg font-semibold text-[#14302a]">Record purchase</h2><p className="mt-1 text-sm text-[#66736d]">Received quantities add to stock through purchase movements.</p></div>
      <form action={submitPurchase} className="mt-4 space-y-4">
        <input name="purchase" type="hidden" value="" />
        <label className="tk-field">Supplier<select onChange={(event) => setSupplierId(event.currentTarget.value)} value={supplierId}><option value="">Add supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}{supplier.phone ? ` · ${supplier.phone}` : ""}</option>)}</select></label>
        {!supplierId ? <div className="grid gap-3 sm:grid-cols-2"><label className="tk-field">Supplier name<input autoComplete="organization" maxLength={120} onChange={(event) => setSupplierName(event.currentTarget.value)} required value={supplierName} /></label><label className="tk-field">Phone<input autoComplete="tel" inputMode="tel" maxLength={32} onChange={(event) => setSupplierPhone(event.currentTarget.value)} value={supplierPhone} /></label></div> : null}

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-[#18231f]">Purchase lines</legend>
          {lines.map((line, index) => (
            <div className="grid gap-2 rounded-md border border-[#14302a]/10 p-3 sm:grid-cols-[minmax(0,1fr)_7rem_9rem_2.75rem] sm:items-end" key={index}>
              <label className="tk-field">Ingredient<select onChange={(event) => setLines(lines.map((item, row) => row === index ? { ...item, ingredientId: event.currentTarget.value } : item))} value={line.ingredientId}><option value="">Choose ingredient</option>{ingredients.filter((ingredient) => ingredient.active).map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} ({ingredient.unit})</option>)}</select></label>
              <label className="tk-field">Quantity<input inputMode="decimal" onChange={(event) => setLines(lines.map((item, row) => row === index ? { ...item, quantity: event.currentTarget.value } : item))} value={line.quantity} /></label>
              <label className="tk-field">Cost/unit (paise)<input inputMode="numeric" onChange={(event) => setLines(lines.map((item, row) => row === index ? { ...item, unitCostPaise: event.currentTarget.value } : item))} value={line.unitCostPaise} /></label>
              <button aria-label="Remove purchase line" className="tk-button-secondary px-0" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, row) => row !== index))} type="button">×</button>
            </div>
          ))}
          <button className="tk-button-secondary" onClick={addLine} type="button">Add ingredient</button>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="tk-field"><span>Purchase total</span><p className="min-h-12 rounded-md border border-[#14302a]/10 bg-[#f5f4ef] px-3 py-3">{currency.format(totalPaise / 100)}</p></div>
          <label className="tk-field">Paid now (₹)<input inputMode="decimal" onChange={(event) => setPaidNowRupees(event.currentTarget.value)} value={paidNowRupees} /></label>
          <label className="tk-field">Payment mode<select disabled={rupeesToPaise(paidNowRupees) === 0} onChange={(event) => setPaymentMode(event.currentTarget.value)} value={paymentMode}><option value="CASH">Cash</option><option value="UPI">UPI</option><option value="CARD">Card</option><option value="BANK">Bank</option></select></label>
        </div>
        <Message state={state} />
        <button className="tk-button-primary w-full sm:w-auto" disabled={pending || ingredients.filter((ingredient) => ingredient.active).length === 0} type="submit">{pending ? "Saving purchase…" : "Save purchase"}</button>
      </form>
    </section>
  );
}

function AdjustmentForm({ ingredients }: { ingredients: Ingredient[] }) {
  const [state, action, pending] = useActionState(adjustStockAction, initialInventoryActionState);
  const [kind, setKind] = useState<AdjustmentKind>("WASTAGE");
  const [ingredientId, setIngredientId] = useState(ingredients.find((ingredient) => ingredient.active)?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");

  function submitAdjustment(formData: FormData) {
    const input = kind === "COUNT"
      ? { kind, ingredientId, countedQuantity: quantity, reason }
      : { kind, ingredientId, quantity, reason };
    formData.set("adjustment", JSON.stringify(input));
    return action(formData);
  }

  return (
    <section className="rounded-md border border-[#14302a]/12 bg-white p-4 sm:p-5">
      <div className="border-b border-[#14302a]/10 pb-3"><h2 className="text-lg font-semibold text-[#14302a]">Adjust stock</h2><p className="mt-1 text-sm text-[#66736d]">Every change is recorded in the movement log.</p></div>
      <form action={submitAdjustment} className="mt-4 space-y-4">
        <input name="adjustment" type="hidden" value="" />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="tk-field">Adjustment<select onChange={(event) => setKind(event.currentTarget.value as AdjustmentKind)} value={kind}><option value="WASTAGE">Wastage</option><option value="SPOILAGE">Spoilage</option><option value="COUNT">Stock count</option></select></label>
          <label className="tk-field">Ingredient<select onChange={(event) => setIngredientId(event.currentTarget.value)} value={ingredientId}>{ingredients.filter((ingredient) => ingredient.active).map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} · {ingredient.currentQuantity} {ingredient.unit}</option>)}</select></label>
        </div>
        <label className="tk-field">{kind === "COUNT" ? "Counted quantity" : "Quantity removed"}<input inputMode="decimal" onChange={(event) => setQuantity(event.currentTarget.value)} placeholder="0.000" value={quantity} /></label>
        <label className="tk-field">Reason<input autoComplete="off" maxLength={500} minLength={3} onChange={(event) => setReason(event.currentTarget.value)} required value={reason} /></label>
        <Message state={state} />
        <button className="tk-button-primary w-full sm:w-auto" disabled={pending || ingredients.filter((ingredient) => ingredient.active).length === 0} type="submit">{pending ? "Saving adjustment…" : "Save adjustment"}</button>
      </form>
    </section>
  );
}

export function InventoryClient({
  items,
  suppliers,
  lowStock,
  canEdit,
  idempotencyKey,
}: {
  items: Ingredient[];
  suppliers: Supplier[];
  lowStock: Ingredient[];
  canEdit: boolean;
  idempotencyKey: string;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#14302a]/15 pb-5">
        <div><p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#d6402b]">Stock</p><h1 className="mt-2 text-3xl font-semibold text-[#14302a]">Inventory</h1></div>
        <Link className="tk-button-secondary" href="/dashboard/inventory/movements">Movement log</Link>
      </div>

      <section aria-labelledby="low-stock-heading" className="mt-5 border-l-4 border-[#e8b230] bg-white p-4">
        <h2 className="font-semibold text-[#14302a]" id="low-stock-heading">Low stock · {lowStock.length}</h2>
        {lowStock.length === 0 ? <p className="mt-2 text-sm text-[#66736d]">All active ingredients are above their reorder levels.</p> : (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{lowStock.map((ingredient) => <li className="flex justify-between gap-3 text-sm" key={ingredient.id}><span className="truncate">{ingredient.name}</span><strong className="shrink-0 text-[#d6402b]">{ingredient.currentQuantity} / {ingredient.reorderLevel} {ingredient.unit}</strong></li>)}</ul>
        )}
      </section>

      {canEdit ? <div className="mt-6 grid items-start gap-5 xl:grid-cols-2"><PurchaseForm ingredients={items} suppliers={suppliers} idempotencyKey={idempotencyKey} /><AdjustmentForm ingredients={items} /></div> : <p className="mt-6 text-sm text-[#66736d]">Only an Owner or Manager can record purchases or adjust stock.</p>}

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-[#14302a]">Ingredients</h2>
        {items.length === 0 ? <p className="py-10 text-center text-sm text-[#66736d]">No ingredients to track yet.</p> : (
          <ul className="mt-3 divide-y divide-[#14302a]/10 border-y border-[#14302a]/10">
            {items.map((ingredient) => (
              <li className="flex flex-wrap items-center justify-between gap-2 py-3" key={ingredient.id}>
                <div className="min-w-0"><p className="truncate font-semibold text-[#18231f]">{ingredient.name}{!ingredient.active ? <span className="ml-2 text-xs text-[#66736d]">Archived</span> : null}</p><p className="mt-1 text-xs text-[#66736d]">Latest cost {currency.format(ingredient.unitCostPaise / 100)} per {ingredient.unit}{ingredient.reorderLevel ? ` · reorder at ${ingredient.reorderLevel}` : ""}</p></div>
                <strong className="text-[#14302a]">{ingredient.currentQuantity} {ingredient.unit}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}