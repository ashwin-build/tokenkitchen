"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentBillingMembership } from "@/server/billing/access";
import {
  cancelOrderForMembership,
  changeOrderStatusForMembership,
  createBillForMembership,
  updatePricesIncludeGstForMembership,
  updateStockModeForMembership,
} from "@/server/billing/service";

export type BillActionState = {
  status: "idle" | "success" | "error";
  message: string;
  order: {
    id: string;
    tokenNo: number;
    invoiceNo: string;
    totalPaise: number;
    paidPaise: number;
    balancePaise: number;
    stockShortage: boolean;
  } | null;
};

function actionError(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Check the bill details and try again.";
  if (error instanceof Error && !error.name.startsWith("Prisma")) return error.message;
  return "The bill could not be saved. Please retry.";
}

export async function createBillAction(_state: BillActionState, formData: FormData): Promise<BillActionState> {
  const membership = await currentBillingMembership();
  try {
    const source = z.string().min(1).max(128 * 1024).parse(formData.get("bill"));
    let request: unknown;
    try {
      request = JSON.parse(source);
    } catch {
      return { status: "error", message: "The cart data could not be read. Refresh and try again.", order: null };
    }

    const result = await createBillForMembership(membership, request);
    revalidatePath("/dashboard/orders");
    revalidatePath("/dashboard/counter");
    return {
      status: "success",
      message: result.stockShortage ? "Bill saved. Stock is below zero in warn mode." : "Bill saved.",
      order: {
        id: result.id,
        tokenNo: result.tokenNo,
        invoiceNo: result.invoiceNo,
        totalPaise: result.totalPaise,
        paidPaise: result.paidPaise,
        balancePaise: result.balancePaise,
        stockShortage: result.stockShortage,
      },
    };
  } catch (error) {
    return { status: "error", message: actionError(error), order: null };
  }
}

export async function updateOrderStatusAction(formData: FormData): Promise<void> {
  const membership = await currentBillingMembership();
  await changeOrderStatusForMembership(membership, {
    orderId: formData.get("orderId"),
    nextStatus: formData.get("nextStatus"),
  });
  revalidatePath("/dashboard/orders");
}

export async function cancelOrderAction(formData: FormData): Promise<void> {
  const membership = await currentBillingMembership();
  await cancelOrderForMembership(membership, {
    orderId: formData.get("orderId"),
    reason: formData.get("reason"),
  });
  revalidatePath("/dashboard/orders");
}

export async function updateStockModeAction(formData: FormData): Promise<void> {
  const membership = await currentBillingMembership();
  await updateStockModeForMembership(membership, formData.get("stockMode"));
  revalidatePath("/dashboard/settings");
}

export async function updatePricesIncludeGstAction(formData: FormData): Promise<void> {
  const membership = await currentBillingMembership();
  await updatePricesIncludeGstForMembership(membership, formData.get("pricesIncludeGst"));
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/counter");
}