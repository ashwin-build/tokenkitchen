import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgresql://tokenkitchen:tokenkitchen@localhost:5433/tokenkitchen?schema=public"),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().min(1).optional(),
  ),
  CLERK_SECRET_KEY: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().min(1).optional(),
  ),
  RAZORPAY_KEY_ID: z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional()),
  RAZORPAY_KEY_SECRET: z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional()),
  RAZORPAY_WEBHOOK_SECRET: z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional()),
  SELLER_NAME: z.preprocess((value) => value === "" ? undefined : value, z.string().trim().min(1).optional()),
  SELLER_ADDRESS: z.preprocess((value) => value === "" ? undefined : value, z.string().trim().min(1).optional()),
  SELLER_GSTIN: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/).optional(),
  ),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

export function getEnv() {
  return envSchema.parse(process.env);
}
