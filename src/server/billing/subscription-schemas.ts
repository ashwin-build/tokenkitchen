import { z } from "zod";
import { en } from "@/i18n/en";

export const gstinSchema = z.string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, en.errors.invalidGstin);

export const createCheckoutOrderSchema = z.object({
  planId: z.string().cuid(),
  clientRequestKey: z.string().trim().min(16).max(200),
  gstin: z.union([z.literal(""), gstinSchema]).optional(),
});