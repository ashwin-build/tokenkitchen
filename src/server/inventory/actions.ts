"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentBillingMembership } from "@/server/billing/access";
import { createPurchaseForMembership, adjustStockForMembership, InventoryServiceError } from "@/server/inventory/services";

export type InventoryActionState = {
  status: "idle" | "success" | "error";
  message: string;
  purchase: { id: string; totalPaise: number; paidPaise: number; balancePaise: number; supplierName: string } | null;
};

export const initialInventoryActionState: InventoryActionState = { status: "idle", message: "", purchase: null };

function actionError(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Check the details and try again.";
  if (error instanceof Error && !error.name.startsWith("Prisma")) return error.message;
  return "The inventory change could not be saved. Please retry.";
}

export async function createPurchaseAction(_state: InventoryActionState, formData: FormData): Promise<InventoryActionState> {
  const membership = await currentBillingMembership();
  try {
    const payload = z.string().min(1).max(128 * 1024).parse(formData.get("purchase"));
    let input: unknown;
    try {
      input = JSON.parse(payload);
    } catch {
      return { status: "error", message: "Purchase details could not be read. Please try again.", purchase: null };
    }
    const purchase = await createPurchaseForMembership(membership, input);
    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/inventory/movements");
    revalidatePath("/dashboard");
    return { status: "success", message: "Purchase saved.", purchase };
  } catch (error) {
    return { status: "error", message: actionError(error), purchase: null };
  }
}

export async function adjustStockAction(_state: InventoryActionState, formData: FormData): Promise<InventoryActionState> {
  const membership = await currentBillingMembership();
  try {
    let input: unknown;
    try {
      input = JSON.parse(z.string().min(1).max(16 * 1024).parse(formData.get("adjustment")));
    } catch {
      throw new InventoryServiceError("Adjustment details could not be read. Please try again.");
    }
    const adjustment = await adjustStockForMembership(membership, input);
    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/inventory/movements");
    revalidatePath("/dashboard");
    return { status: "success", message: `${adjustment.name} stock updated to ${adjustment.currentQuantity} ${adjustment.unit}.`, purchase: null };
  } catch (error) {
    return { status: "error", message: actionError(error), purchase: null };
  }
}