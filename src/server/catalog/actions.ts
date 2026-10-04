"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentCatalogMembership } from "@/server/catalog/access";
import { assertCatalogEditor } from "@/server/catalog/permissions";
import {
  archiveDishForMembership,
  archiveIngredientForMembership,
  saveDishForMembership,
  saveIngredientForMembership,
} from "@/server/catalog/services";

import type { CatalogActionState } from "@/server/catalog/action-state";

function fields(formData: FormData, names: string[]) {
  return Object.fromEntries(names.map((name) => [name, formData.get(name)]));
}

function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Check the form fields and try again.";
  if (error instanceof Error && !error.name.startsWith("Prisma")) return error.message;
  return "We could not save that item. Check the details and try again.";
}

export async function saveIngredientAction(_state: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const membership = await currentCatalogMembership();
  try {
    assertCatalogEditor(membership);
    await saveIngredientForMembership(membership, fields(formData, [
      "id", "name", "unit", "openingQuantity", "reorderLevel", "costPerUnitPaise", "isActive",
    ]));
    revalidatePath("/dashboard/ingredients");
    revalidatePath("/dashboard/dishes");
    return { status: "success", message: "Ingredient saved." };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}

export async function archiveIngredientAction(_state: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const membership = await currentCatalogMembership();
  try {
    assertCatalogEditor(membership);
    await archiveIngredientForMembership(membership, formData.get("id"));
    revalidatePath("/dashboard/ingredients");
    revalidatePath("/dashboard/dishes");
    return { status: "success", message: "Ingredient archived." };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}

export async function saveDishAction(_state: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const membership = await currentCatalogMembership();
  try {
    assertCatalogEditor(membership);
    await saveDishForMembership(membership, fields(formData, [
      "id", "name", "priceRupees", "gstRate", "isActive", "recipeLines",
    ]));
    revalidatePath("/dashboard/dishes");
    return { status: "success", message: "Dish saved." };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}

export async function archiveDishAction(_state: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const membership = await currentCatalogMembership();
  try {
    assertCatalogEditor(membership);
    await archiveDishForMembership(membership, formData.get("id"));
    revalidatePath("/dashboard/dishes");
    return { status: "success", message: "Dish archived." };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}