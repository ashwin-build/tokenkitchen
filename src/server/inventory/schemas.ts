import { z } from "zod";
import { paiseSchema, quantitySchema } from "@/server/catalog/schemas";

const supplierSchema = z.object({
  partyId: z.string().cuid().optional(),
  name: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(32).optional(),
}).superRefine((supplier, context) => {
  if (!supplier.partyId && !supplier.name) {
    context.addIssue({ code: "custom", path: ["name"], message: "Choose a supplier or enter a supplier name." });
  }
  if (supplier.partyId && supplier.name) {
    context.addIssue({ code: "custom", path: ["name"], message: "Choose an existing supplier or enter a new supplier name." });
  }
});

export const purchaseRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(16).max(200),
  supplier: supplierSchema,
  lines: z.array(z.object({
    ingredientId: z.string().cuid(),
    quantity: quantitySchema.refine((value) => Number(value) > 0, "Quantity must be greater than zero."),
    unitCostPaise: paiseSchema,
  })).min(1).max(100),
  paidNowPaise: paiseSchema,
  paymentMode: z.enum(["CASH", "UPI", "CARD", "BANK"]).optional(),
}).superRefine((purchase, context) => {
  if (purchase.paidNowPaise > 0 && !purchase.paymentMode) {
    context.addIssue({ code: "custom", path: ["paymentMode"], message: "Choose how the supplier was paid." });
  }
  if (new Set(purchase.lines.map((line) => line.ingredientId)).size !== purchase.lines.length) {
    context.addIssue({ code: "custom", path: ["lines"], message: "Use each ingredient only once per purchase." });
  }
});

const reasonSchema = z.string().trim().min(3, "Enter a reason.").max(500);

export const wastageAdjustmentSchema = z.object({
  kind: z.enum(["WASTAGE", "SPOILAGE"]),
  ingredientId: z.string().cuid(),
  quantity: quantitySchema.refine((value) => Number(value) > 0, "Quantity must be greater than zero."),
  reason: reasonSchema,
});

export const stockCountAdjustmentSchema = z.object({
  kind: z.literal("COUNT"),
  ingredientId: z.string().cuid(),
  countedQuantity: quantitySchema,
  reason: reasonSchema,
});

export const stockAdjustmentSchema = z.discriminatedUnion("kind", [wastageAdjustmentSchema, stockCountAdjustmentSchema]);

export const movementFilterSchema = z.object({
  ingredientId: z.union([z.literal(""), z.string().cuid()]).optional(),
  type: z.union([z.literal(""), z.enum(["OPENING", "PURCHASE", "SALE", "WASTAGE", "SPOILAGE", "ADJUSTMENT", "RETURN"])]).optional(),
  from: z.union([z.literal(""), z.iso.date()]).optional(),
  to: z.union([z.literal(""), z.iso.date()]).optional(),
}).refine((filter) => !filter.from || !filter.to || filter.from <= filter.to, {
  message: "Start date must be before end date.",
  path: ["to"],
});