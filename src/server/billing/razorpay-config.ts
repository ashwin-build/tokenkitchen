import { getEnv } from "@/lib/env";
import { en } from "@/i18n/en";

export class RazorpayConfigurationError extends Error {
  constructor(message: string = en.errors.billingConfiguration) {
    super(message);
    this.name = "RazorpayConfigurationError";
  }
}

export function razorpayCredentials(requireWebhookSecret = false) {
  const env = getEnv();
  const keyPrefix = env.NODE_ENV === "production" ? "rzp_live_" : "rzp_test_";
  if (!env.RAZORPAY_KEY_ID?.startsWith(keyPrefix) || !env.RAZORPAY_KEY_SECRET) {
    throw new RazorpayConfigurationError();
  }
  if (requireWebhookSecret && !env.RAZORPAY_WEBHOOK_SECRET) {
    throw new RazorpayConfigurationError();
  }
  return {
    keyId: env.RAZORPAY_KEY_ID,
    keySecret: env.RAZORPAY_KEY_SECRET,
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
  };
}

export function sellerInvoiceDetails() {
  const env = getEnv();
  if (!env.SELLER_NAME || !env.SELLER_ADDRESS || !env.SELLER_GSTIN) {
    throw new RazorpayConfigurationError(en.billing.sellerSetup);
  }
  return { name: env.SELLER_NAME, address: env.SELLER_ADDRESS, gstin: env.SELLER_GSTIN };
}
