"use server";

import { z } from "zod";
import { en } from "@/i18n/en";
import { currentBillingMembership } from "@/server/billing/access";
import { createRazorpayOrderForMembership } from "@/server/billing/razorpay-orders";

export type SubscriptionCheckoutState = {
  status: "idle" | "error";
  message: string;
  checkout: Awaited<ReturnType<typeof createRazorpayOrderForMembership>> | null;
};

export async function createSubscriptionOrderAction(
  _state: SubscriptionCheckoutState,
  formData: FormData,
): Promise<SubscriptionCheckoutState> {
  const membership = await currentBillingMembership();
  try {
    const input = {
      planId: formData.get("planId"),
      gstin: formData.get("gstin") ?? "",
      clientRequestKey: formData.get("clientRequestKey"),
    };
    const checkout = await createRazorpayOrderForMembership(membership, input);
    return { status: "idle", message: "", checkout };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const isGstin = error.issues.some((issue) => issue.path.includes("gstin"));
      return { status: "error", message: isGstin ? en.errors.invalidGstin : en.errors.checkoutFailed, checkout: null };
    }
    if (error instanceof Error) return { status: "error", message: error.message, checkout: null };
    return { status: "error", message: en.errors.checkoutFailed, checkout: null };
  }
}
