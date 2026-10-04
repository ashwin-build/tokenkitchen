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
  if (!/^rzp_(test|live)_/.test(environment.RAZORPAY_KEY_ID)) {
    throw new Error("RAZORPAY_KEY_ID must be a valid Razorpay test or live key.");
  }
}
