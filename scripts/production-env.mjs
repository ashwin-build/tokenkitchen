const required = [
  "DATABASE_URL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_APP_URL",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "SELLER_NAME",
  "SELLER_ADDRESS",
  "SELLER_GSTIN",
];

export function assertProductionEnvironment(environment = process.env) {
  const missing = required.filter((name) => !environment[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Production startup requires: ${missing.join(", ")}.`);
  }

  const appUrl = new URL(environment.NEXT_PUBLIC_APP_URL);
  if (["localhost", "127.0.0.1", "::1"].includes(appUrl.hostname)) {
    throw new Error("NEXT_PUBLIC_APP_URL must use the public production URL.");
  }
  if (!environment.RAZORPAY_KEY_ID.startsWith("rzp_live_")) {
    throw new Error("Production startup requires an rzp_live_ Razorpay key.");
  }
}
