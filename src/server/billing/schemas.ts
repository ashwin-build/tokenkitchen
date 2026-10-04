import { z } from "zod";
import { quantitySchema } from "@/server/catalog/schemas";

export const billRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(16).max(200),
  items: z.array(z.object({
    dishId: z.string().cuid(),
    quantity: quantitySchema.refine((value) => Number(value) > 0, "Quantity must be greater than zero."),
  })).min(1, "Add at least one dish to the cart.").max(100),
  customer: z.object({
    partyId: z.string().cuid().optional(),
    name: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(32).optional(),
  }).optional(),
  payments: z.array(z.object({
    mode: z.enum(["CASH", "UPI", "CARD", "BANK"]),
    amountPaise: z.number().int().positive().max(2147483647),
  })).max(6),
}).superRefine((bill, context) => {
  const dishIds = bill.items.map((item) => item.dishId);
  if (new Set(dishIds).size !== dishIds.length) {
    context.addIssue({ code: "custom", path: ["items"], message: "Each dish can appear only once in the cart." });
  }
  if (bill.customer?.partyId && (bill.customer.name || bill.customer.phone)) {
    context.addIssue({ code: "custom", path: ["customer"], message: "Choose an existing customer or enter a new customer's details." });
  }
});

export const statusTransitionSchema = z.object({
  orderId: z.string().cuid(),
  nextStatus: z.enum(["READY", "COMPLETED"]),
});

export const cancelOrderSchema = z.object({
  orderId: z.string().cuid(),
  reason: z.string().trim().min(3, "Enter a cancellation reason.").max(500),
});