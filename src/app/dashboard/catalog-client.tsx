"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import {
  archiveDishAction,
  archiveIngredientAction,
  saveDishAction,
  saveIngredientAction,
} from "@/server/catalog/actions";
import {
  confirmCatalogImportAction,
  previewCatalogImportAction,
} from "@/server/catalog/import-actions";
import type { CatalogImportKind } from "@/server/catalog/import-format";
import {
  initialCatalogActionState,
  initialCatalogImportState,
} from "@/server/catalog/action-state";

type IngredientItem = {
  id: string;
  name: string;
  unit: "kg" | "g" | "L" | "ml" | "pcs";
  currentQuantity: string;
  reorderLevel: string;
  costPerUnitPaise: number;
  active: boolean;
};

type RecipeItem = {
  ingredientId: string;
  ingredientName: string;
  quantityPerDish: string;
  unit: IngredientItem["unit"];
  unitCostPaise: number;
  ingredientActive: boolean;
};

type DishItem = {
  id: string;
  name: string;
  pricePaise: number;
  gstRate: number;
  active: boolean;
  foodCostPaise: number;
  recipeLines: RecipeItem[];
};

type IngredientOption = Pick<IngredientItem, "id" | "name" | "unit">;

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

function Message({ state }: { state: { status: string; message: string } }) {
  if (!state.message) return null;
  return (
    <p aria-live="polite" className={`text-sm ${state.status === "error" ? "text-[#d6402b]" : "text-[#14302a]"}`}>
      {state.message}
    </p>
  );
}

function CatalogImportPanel({ kind, onClose }: { kind: CatalogImportKind; onClose: () => void }) {
  const [csv, setCsv] = useState("");
  const [fileError, setFileError] = useState("");
  const [previewState, previewAction, previewPending] = useActionState(previewCatalogImportAction, initialCatalogImportState);
  const [confirmState, confirmAction, confirmPending] = useActionState(confirmCatalogImportAction, initialCatalogImportState);
  const router = useRouter();
  const preview = confirmState.status === "error" && confirmState.preview
    ? confirmState.preview
    : previewState.preview;
  const canConfirm = preview && preview.sourceCsv === csv && preview.errors.length === 0 && preview.rows.every((row) => row.errors.length === 0);
  const singular = kind === "ingredients" ? "ingredient" : "dish";

  function loadFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 512 * 1024) {
      setCsv("");
      setFileError("CSV exceeds the 512 KB size limit.");
      return;
    }
    setFileError("");
    void file.text().then(setCsv);
  }

  if (confirmState.status === "success") {
    return (
      <div className="fixed inset-0 z-30 grid place-items-end bg-black/35 p-0 sm:place-items-center sm:p-5" role="presentation">
        <section aria-labelledby="import-done-title" aria-modal="true" className="w-full max-w-2xl rounded-t-lg bg-white p-5 shadow-xl sm:rounded-lg" role="dialog">
          <h2 className="text-xl font-semibold text-[#14302a]" id="import-done-title">Import complete</h2>
          <Message state={confirmState} />
          {confirmState.preview ? <p className="mt-3 text-sm text-[#66736d]">{confirmState.preview.counts.added} added · {confirmState.preview.counts.updated} updated · {confirmState.preview.counts.skipped} skipped</p> : null}
          <button className="tk-button-primary mt-5" onClick={() => { router.refresh(); onClose(); }} type="button">Done</button>
        </section>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-30 grid place-items-end bg-black/35 p-0 sm:place-items-center sm:p-5" role="presentation">
      <section aria-labelledby="import-title" aria-modal="true" className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-t-lg bg-white p-5 shadow-xl sm:rounded-lg sm:p-7" role="dialog">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-[#14302a]" id="import-title">Import {kind}</h2>
            <p className="mt-1 text-sm text-[#66736d]">CSV up to 512 KB. Imports with row errors are not applied.</p>
          </div>
          <button aria-label="Close import" className="tk-button-secondary" onClick={onClose} type="button">Close</button>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <form action={`/api/catalog/${kind}/template`} method="get"><button className="tk-button-secondary" type="submit">Download template</button></form>
          <form action={`/api/catalog/${kind}`} method="get"><button className="tk-button-secondary" type="submit">Export CSV</button></form>
        </div>

        <form action={previewAction} className="mt-5 space-y-3">
          <input name="kind" type="hidden" value={kind} />
          <label className="block text-sm font-semibold text-[#18231f]" htmlFor={`${kind}-csv-file`}>Choose CSV file</label>
          <input accept=".csv,text/csv" className="block min-h-11 w-full text-sm" id={`${kind}-csv-file`} onChange={(event) => loadFile(event.currentTarget.files?.[0])} type="file" />
          {fileError ? <p className="text-sm text-[#d6402b]" role="alert">{fileError}</p> : null}
          <label className="block text-sm font-semibold text-[#18231f]" htmlFor={`${kind}-csv`}>Or paste CSV</label>
          <textarea
            className="min-h-40 w-full rounded-md border border-[#14302a]/20 bg-white p-3 font-mono text-xs outline-none focus:border-[#14302a]"
            id={`${kind}-csv`}
            name="csv"
            onChange={(event) => setCsv(event.currentTarget.value)}
            value={csv}
          />
          <button className="tk-button-primary" disabled={previewPending || !csv} type="submit">
            {previewPending ? "Checking…" : "Preview changes"}
          </button>
          <Message state={previewState} />
        </form>

        {preview && preview.sourceCsv === csv ? (
          <section aria-labelledby="preview-heading" className="mt-6 border-t border-[#14302a]/10 pt-5">
            <h3 className="text-base font-semibold text-[#14302a]" id="preview-heading">Preview</h3>
            <p className="mt-1 text-sm text-[#66736d]">
              {preview.counts.added} to add · {preview.counts.updated} to update · {preview.counts.skipped} skipped
            </p>
            {preview.errors.map((error) => <p className="mt-2 text-sm text-[#d6402b]" key={error}>{error}</p>)}
            <div className="mt-3 max-h-48 overflow-auto rounded-md border border-[#14302a]/10">
              {preview.rows.map((row) => (
                <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-3 border-b border-[#14302a]/10 px-3 py-2 text-sm last:border-0" key={row.rowNumber}>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[#18231f]">{row.name || `Row ${row.rowNumber}`}</p>
                    {row.errors.map((error) => <p className="mt-1 text-xs text-[#d6402b]" key={error}>{error}</p>)}
                  </div>
                  <span className="text-right capitalize text-[#66736d]">{row.action}</span>
                </div>
              ))}
            </div>
            <form action={confirmAction} className="mt-4 flex flex-wrap items-center gap-3">
              <input name="kind" type="hidden" value={kind} />
              <input name="csv" type="hidden" value={preview.sourceCsv} />
              <button className="tk-button-primary" disabled={!canConfirm || confirmPending} type="submit">
                {confirmPending ? "Importing…" : `Confirm ${singular} import`}
              </button>
              <Message state={confirmState} />
            </form>
          </section>
        ) : null}
      </section>
    </div>
  );
}

function IngredientArchiveForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(archiveIngredientAction, initialCatalogActionState);
  return (
    <form action={action} className="flex items-center gap-2">
      <input name="id" type="hidden" value={id} />
      <button className="tk-button-danger" disabled={pending} type="submit">Archive</button>
      <Message state={state} />
    </form>
  );
}

function DishArchiveForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(archiveDishAction, initialCatalogActionState);
  return (
    <form action={action} className="flex items-center gap-2">
      <input name="id" type="hidden" value={id} />
      <button className="tk-button-danger" disabled={pending} type="submit">Archive</button>
      <Message state={state} />
    </form>
  );
}

function IngredientForm({ item, onClose }: { item: IngredientItem | null; onClose: () => void }) {
  const [state, action, pending] = useActionState(saveIngredientAction, initialCatalogActionState);
  const router = useRouter();
  if (state.status === "success") {
    return (
      <div className="fixed inset-0 z-20 grid place-items-end bg-black/35 p-0 sm:place-items-center sm:p-5" role="presentation">
        <section aria-labelledby="ingredient-saved-title" aria-modal="true" className="w-full max-w-xl rounded-t-lg bg-white p-5 shadow-xl sm:rounded-lg" role="dialog">
          <h2 className="text-xl font-semibold text-[#14302a]" id="ingredient-saved-title">Ingredient saved</h2>
          <Message state={state} />
          <button className="tk-button-primary mt-5" onClick={() => { router.refresh(); onClose(); }} type="button">Done</button>
        </section>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-20 grid place-items-end bg-black/35 p-0 sm:place-items-center sm:p-5" role="presentation">
      <section aria-labelledby="ingredient-form-title" aria-modal="true" className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-lg bg-white p-5 shadow-xl sm:rounded-lg sm:p-7" role="dialog">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-xl font-semibold text-[#14302a]" id="ingredient-form-title">{item ? "Edit ingredient" : "Add ingredient"}</h2>
          <button aria-label="Close ingredient form" className="tk-button-secondary" onClick={onClose} type="button">Close</button>
        </div>
        <form action={action} className="mt-5 grid gap-4 sm:grid-cols-2">
          <input name="id" type="hidden" value={item?.id ?? ""} />
          <label className="tk-field sm:col-span-2">Name<input autoComplete="off" defaultValue={item?.name ?? ""} maxLength={80} name="name" required /></label>
          <label className="tk-field">Unit<select defaultValue={item?.unit ?? "kg"} name="unit"><option value="kg">kg</option><option value="g">g</option><option value="L">L</option><option value="ml">ml</option><option value="pcs">pcs</option></select></label>
          {item ? (
            <div className="tk-field"><span>Current quantity</span><p className="min-h-12 rounded-md border border-[#14302a]/10 bg-[#f5f4ef] px-3 py-3 text-sm">{item.currentQuantity} {item.unit}</p><input name="openingQuantity" type="hidden" value="0" /></div>
          ) : (
            <label className="tk-field">Opening quantity<input inputMode="decimal" name="openingQuantity" placeholder="0" required /></label>
          )}
          <label className="tk-field">Reorder level<input defaultValue={item?.reorderLevel ?? ""} inputMode="decimal" name="reorderLevel" placeholder="Optional" /></label>
          <label className="tk-field">Cost per unit (paise)<input defaultValue={String(item?.costPerUnitPaise ?? 0)} inputMode="numeric" min="0" name="costPerUnitPaise" required /></label>
          <label className="tk-field">Status<select defaultValue={String(item?.active ?? true)} name="isActive"><option value="true">Active</option><option value="false">Archived</option></select></label>
          <div className="sm:col-span-2"><Message state={state} /></div>
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button className="tk-button-primary" disabled={pending} type="submit">{pending ? "Saving…" : "Save ingredient"}</button>
            <button className="tk-button-secondary" onClick={onClose} type="button">Cancel</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function DishForm({ item, ingredients, onClose }: { item: DishItem | null; ingredients: IngredientOption[]; onClose: () => void }) {
  const [state, action, pending] = useActionState(saveDishAction, initialCatalogActionState);
  const [recipeLines, setRecipeLines] = useState(item?.recipeLines.map((line) => ({ ingredientId: line.ingredientId, quantityPerDish: line.quantityPerDish })) ?? []);
  const [selectedIngredientId, setSelectedIngredientId] = useState("");
  const [selectedQuantity, setSelectedQuantity] = useState("1");
  const router = useRouter();
  if (state.status === "success") {
    return (
      <div className="fixed inset-0 z-20 grid place-items-end bg-black/35 p-0 sm:place-items-center sm:p-5" role="presentation">
        <section aria-labelledby="dish-saved-title" aria-modal="true" className="w-full max-w-2xl rounded-t-lg bg-white p-5 shadow-xl sm:rounded-lg" role="dialog">
          <h2 className="text-xl font-semibold text-[#14302a]" id="dish-saved-title">Dish saved</h2>
          <Message state={state} />
          <button className="tk-button-primary mt-5" onClick={() => { router.refresh(); onClose(); }} type="button">Done</button>
        </section>
      </div>
    );
  }

  function addRecipeLine() {
    if (!selectedIngredientId || Number(selectedQuantity) <= 0) return;
    if (recipeLines.some((line) => line.ingredientId === selectedIngredientId)) return;
    setRecipeLines([...recipeLines, { ingredientId: selectedIngredientId, quantityPerDish: selectedQuantity }]);
    setSelectedIngredientId("");
    setSelectedQuantity("1");
  }

  return (
    <div className="fixed inset-0 z-20 grid place-items-end bg-black/35 p-0 sm:place-items-center sm:p-5" role="presentation">
      <section aria-labelledby="dish-form-title" aria-modal="true" className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-lg bg-white p-5 shadow-xl sm:rounded-lg sm:p-7" role="dialog">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-xl font-semibold text-[#14302a]" id="dish-form-title">{item ? "Edit dish" : "Add dish"}</h2>
          <button aria-label="Close dish form" className="tk-button-secondary" onClick={onClose} type="button">Close</button>
        </div>
        <form action={action} className="mt-5 grid gap-4 sm:grid-cols-2">
          <input name="id" type="hidden" value={item?.id ?? ""} />
          <input name="recipeLines" type="hidden" value={JSON.stringify(recipeLines)} />
          <label className="tk-field sm:col-span-2">Name<input autoComplete="off" defaultValue={item?.name ?? ""} maxLength={80} name="name" required /></label>
          <label className="tk-field">Price (₹)<input defaultValue={item ? (item.pricePaise / 100).toFixed(2) : ""} inputMode="decimal" name="priceRupees" required /></label>
          <label className="tk-field">GST rate<select defaultValue={String(item?.gstRate ?? 5)} name="gstRate"><option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option></select></label>
          <label className="tk-field">Status<select defaultValue={String(item?.active ?? true)} name="isActive"><option value="true">Active</option><option value="false">Archived</option></select></label>

          <fieldset className="space-y-3 sm:col-span-2">
            <legend className="text-sm font-semibold text-[#18231f]">Recipe per serving</legend>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
              <label className="tk-field"><span className="sr-only">Ingredient</span><select aria-label="Ingredient" onChange={(event) => setSelectedIngredientId(event.currentTarget.value)} value={selectedIngredientId}><option value="">Choose ingredient</option>{ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} ({ingredient.unit})</option>)}</select></label>
              <label className="tk-field"><span className="sr-only">Quantity per serving</span><input aria-label="Quantity per serving" inputMode="decimal" min="0.001" onChange={(event) => setSelectedQuantity(event.currentTarget.value)} step="0.001" value={selectedQuantity} /></label>
              <button className="tk-button-secondary" onClick={addRecipeLine} type="button">Add line</button>
            </div>
            {ingredients.length === 0 ? <p className="text-sm text-[#66736d]">Add an active ingredient before creating a recipe.</p> : null}
            {recipeLines.length > 0 ? (
              <ul className="divide-y divide-[#14302a]/10 rounded-md border border-[#14302a]/10">
                {recipeLines.map((line) => {
                  const ingredient = ingredients.find((option) => option.id === line.ingredientId);
                  const existingLine = item?.recipeLines.find((entry) => entry.ingredientId === line.ingredientId);
                  const unit = ingredient?.unit ?? existingLine?.unit ?? "kg";
                  return (
                    <li className="flex min-h-12 items-center justify-between gap-3 px-3 py-2 text-sm" key={line.ingredientId}>
                      <span className="min-w-0 truncate">{ingredient?.name ?? existingLine?.ingredientName ?? "Archived ingredient"}</span>
                      <span className="shrink-0 text-[#66736d]">{line.quantityPerDish} {unit}</span>
                      <button aria-label="Remove recipe line" className="text-sm font-semibold text-[#d6402b]" onClick={() => setRecipeLines(recipeLines.filter((entry) => entry.ingredientId !== line.ingredientId))} type="button">Remove</button>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-sm text-[#66736d]">No recipe ingredients yet.</p>}
          </fieldset>
          <div className="sm:col-span-2"><Message state={state} /></div>
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button className="tk-button-primary" disabled={pending} type="submit">{pending ? "Saving…" : "Save dish"}</button>
            <button className="tk-button-secondary" onClick={onClose} type="button">Cancel</button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function IngredientCatalog({ items, canEdit }: { items: IngredientItem[]; canEdit: boolean }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<IngredientItem | null | undefined>(undefined);
  const [importOpen, setImportOpen] = useState(false);
  const filtered = items.filter((item) => item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#14302a]/15 pb-5">
        <div><p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#d6402b]">Catalog</p><h1 className="mt-2 text-3xl font-semibold text-[#14302a]">Ingredients</h1></div>
        <div className="flex flex-wrap gap-2">
          <form action="/api/catalog/ingredients" method="get"><button className="tk-button-secondary" type="submit">Export CSV</button></form>
          {canEdit ? <button className="tk-button-secondary" onClick={() => setImportOpen(true)} type="button">Import CSV</button> : null}
          {canEdit ? <button className="tk-button-primary" onClick={() => setSelected(null)} type="button">Add ingredient</button> : null}
        </div>
      </div>
      <label className="tk-search mt-5"><span>Search ingredients</span><input onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Search by name" type="search" value={search} /></label>
      {filtered.length === 0 ? (
        <div className="py-16 text-center"><h2 className="text-lg font-semibold text-[#14302a]">{search ? "No matching ingredients" : "No ingredients yet"}</h2><p className="mt-2 text-sm text-[#66736d]">{search ? "Try a different name." : "Add ingredients to track recipes and food cost."}</p></div>
      ) : (
        <ul className="mt-5 divide-y divide-[#14302a]/10 border-y border-[#14302a]/10">
          {filtered.map((item) => (
            <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between" key={item.id}>
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate font-semibold text-[#18231f]">{item.name}</h2>{!item.active ? <span className="text-xs font-semibold text-[#66736d]">Archived</span> : null}</div><p className="mt-1 text-sm text-[#66736d]">{item.currentQuantity} {item.unit}{item.reorderLevel ? ` · Reorder at ${item.reorderLevel} ${item.unit}` : ""} · {money.format(item.costPerUnitPaise / 100)} per {item.unit}</p></div>
              {canEdit ? <div className="flex flex-wrap items-center gap-2"><button className="tk-button-secondary" onClick={() => setSelected(item)} type="button">Edit</button>{item.active ? <IngredientArchiveForm id={item.id} /> : null}</div> : null}
            </li>
          ))}
        </ul>
      )}
      {selected !== undefined ? <IngredientForm item={selected} onClose={() => setSelected(undefined)} /> : null}
      {importOpen ? <CatalogImportPanel kind="ingredients" onClose={() => setImportOpen(false)} /> : null}
    </section>
  );
}

export function DishCatalog({ items, ingredients, canEdit }: { items: DishItem[]; ingredients: IngredientOption[]; canEdit: boolean }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DishItem | null | undefined>(undefined);
  const [importOpen, setImportOpen] = useState(false);
  const filtered = items.filter((item) => item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#14302a]/15 pb-5">
        <div><p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#d6402b]">Catalog</p><h1 className="mt-2 text-3xl font-semibold text-[#14302a]">Dishes</h1></div>
        <div className="flex flex-wrap gap-2">
          <form action="/api/catalog/dishes" method="get"><button className="tk-button-secondary" type="submit">Export CSV</button></form>
          {canEdit ? <button className="tk-button-secondary" onClick={() => setImportOpen(true)} type="button">Import CSV</button> : null}
          {canEdit ? <button className="tk-button-primary" onClick={() => setSelected(null)} type="button">Add dish</button> : null}
        </div>
      </div>
      <label className="tk-search mt-5"><span>Search dishes</span><input onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Search by name" type="search" value={search} /></label>
      {filtered.length === 0 ? (
        <div className="py-16 text-center"><h2 className="text-lg font-semibold text-[#14302a]">{search ? "No matching dishes" : "No dishes yet"}</h2><p className="mt-2 text-sm text-[#66736d]">{search ? "Try a different name." : "Add dishes and their recipe lines to see food cost."}</p></div>
      ) : (
        <ul className="mt-5 divide-y divide-[#14302a]/10 border-y border-[#14302a]/10">
          {filtered.map((item) => (
            <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between" key={item.id}>
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate font-semibold text-[#18231f]">{item.name}</h2>{!item.active ? <span className="text-xs font-semibold text-[#66736d]">Archived</span> : null}</div><p className="mt-1 text-sm text-[#66736d]">{money.format(item.pricePaise / 100)} · GST {item.gstRate}% · Food cost {money.format(item.foodCostPaise / 100)}</p><p className="mt-1 truncate text-xs text-[#66736d]">{item.recipeLines.length ? item.recipeLines.map((line) => `${line.ingredientName} ${line.quantityPerDish} ${line.unit}`).join(" · ") : "No recipe"}</p></div>
              {canEdit ? <div className="flex flex-wrap items-center gap-2"><button className="tk-button-secondary" onClick={() => setSelected(item)} type="button">Edit</button>{item.active ? <DishArchiveForm id={item.id} /> : null}</div> : null}
            </li>
          ))}
        </ul>
      )}
      {selected !== undefined ? <DishForm item={selected} ingredients={ingredients} onClose={() => setSelected(undefined)} /> : null}
      {importOpen ? <CatalogImportPanel kind="dishes" onClose={() => setImportOpen(false)} /> : null}
    </section>
  );
}