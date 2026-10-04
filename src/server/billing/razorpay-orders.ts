import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { en } from "@/i18n/en";
import { platformPrisma, systemTenantDatabase, tenantDatabase } from "@/server/db/prisma";
import type { CatalogMembership } from "@/server/catalog/permissions";
import { calculateSubscriptionTax } from "@/server/billing/subscription-tax";
import { createCheckoutOrderSchema } from "@/server/billing/subscription-schemas";
import { razorpayCredentials, sellerInvoiceDetails } from "@/server/billing/razorpay-config";

type CheckoutMembership = CatalogMembership & { email: string };

export type CheckoutOrderResult = {
  orderId: string;
  amountPaise: number;
  currency: "INR";
  keyId: string;
  buyerName: string;
  buyerEmail: string;
  planName: string;
  attemptId: string;
};

export class SubscriptionCheckoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubscriptionCheckoutError";
  }
}

const razorpayOrderSchema = z.object({
  id: z.string().min(1),
  amount: z.number().int().positive(),
  currency: z.literal("INR"),
});

function checkoutResult(
  attempt: {
    razorpayOrderId: string | null;
    amountPaise: number;
    buyerBusinessName: string;
    id: string;
    planCatalog: { name: string };
  },
  email: string,
  keyId: string,
): CheckoutOrderResult {
  if (!attempt.razorpayOrderId) throw new SubscriptionCheckoutError(en.errors.checkoutPreparing);
  return {
    orderId: attempt.razorpayOrderId,
    amountPaise: attempt.amountPaise,
    currency: "INR",
    keyId,
    buyerName: attempt.buyerBusinessName,
    buyerEmail: email,
    planName: attempt.planCatalog.name,
    attemptId: attempt.id,
  };
}

export async function createRazorpayOrderForMembership(
  membership: CheckoutMembership,
  input: unknown,
): Promise<CheckoutOrderResult> {
  if (membership.role !== "OWNER") throw new SubscriptionCheckoutError(en.errors.ownerRequired);

  const request = createCheckoutOrderSchema.parse(input);
  const credentials = razorpayCredentials();
  sellerInvoiceDetails();

  const database = tenantDatabase(membership.tenantId);
  const [tenant, plan] = await Promise.all([
    database.tenant.findUniqueOrThrow({ where: { id: membership.tenantId } }),
    platformPrisma.planCatalog.findFirst({ where: { id: request.planId, isActive: true } }),
  ]);
  if (!plan) throw new SubscriptionCheckoutError(en.errors.planUnavailable);

  const buyerGstin = request.gstin || tenant.gstin || null;
  if (buyerGstin) {
    const valid = createCheckoutOrderSchema.shape.gstin.safeParse(buyerGstin);
    if (!valid.success) throw new SubscriptionCheckoutError(en.errors.invalidGstin);
  }

  const tax = calculateSubscriptionTax(plan.amountPaise, plan.gstInclusive, Number(plan.gstRate));

  // Replay of an earlier request with the same key: return the stored result, never create a second order.
  const existing = await database.paymentAttempt.findFirst({
    where: { clientRequestKey: request.clientRequestKey },
    include: { planCatalog: { select: { name: true } } },
  });
  if (existing) {
    if (existing.planCatalogId !== plan.id || existing.buyerGstin !== buyerGstin) {
      throw new SubscriptionCheckoutError(en.errors.checkoutFailed);
    }
    if (existing.status === "CREATED" && existing.razorpayOrderId) {
      return checkoutResult(existing, membership.email, credentials.keyId);
    }
    if (existing.status === "CREATING") throw new SubscriptionCheckoutError(en.errors.checkoutPreparing);
    throw new SubscriptionCheckoutError(en.errors.checkoutFailed);
  }

  let attempt;
  try {
    attempt = await database.paymentAttempt.create({
      data: {
        tenantId: membership.tenantId,
        planCatalogId: plan.id,
        clientRequestKey: request.clientRequestKey,
        status: "CREATING",
        buyerBusinessName: tenant.name,
        buyerGstin,
        planAmountPaise: plan.amountPaise,
        amountPaise: tax.totalPaise,
        taxableAmountPaise: tax.taxableAmountPaise,
        gstAmountPaise: tax.gstAmountPaise,
        cgstPaise: tax.cgstPaise,
        sgstPaise: tax.sgstPaise,
        gstInclusive: plan.gstInclusive,
        gstRate: plan.gstRate,
      },
    });
  } catch (error: unknown) {
    // Two overlapping requests with the same key: the loser must not create another Razorpay order.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const retry = await database.paymentAttempt.findFirst({
        where: { clientRequestKey: request.clientRequestKey },
        include: { planCatalog: { select: { name: true } } },
      });
      if (retry?.status === "CREATED" && retry.razorpayOrderId) {
        return checkoutResult(retry, membership.email, credentials.keyId);
      }
      throw new SubscriptionCheckoutError(en.errors.checkoutPreparing);
    }
    throw error;
  }

  try {
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString("base64")}`,
      },
      body: JSON.stringify({
        amount: tax.totalPaise,
        currency: "INR",
        receipt: attempt.id,
        notes: { tenantId: membership.tenantId, planId: plan.id },
      }),
      cache: "no-store",
    });

    const raw: unknown = await response.json().catch(() => null);

    console.error("[checkout] Razorpay response", {
      status: response.status,
      ok: response.ok,
      body: raw,
      expectedAmount: tax.totalPaise,
    });
    const verifiedOrder = razorpayOrderSchema.safeParse(raw);
    if (!response.ok || !verifiedOrder.success || verifiedOrder.data.amount !== tax.totalPaise) {
      await systemTenantDatabase(membership.tenantId).paymentAttempt.updateMany({
        where: { id: attempt.id, status: "CREATING" },
        data: { status: "FAILED", failureReason: en.errors.checkoutFailed },
      });
      throw new SubscriptionCheckoutError(en.errors.checkoutFailed);
    }

    const razorpayOrderId = verifiedOrder.data.id;
    await systemTenantDatabase(membership.tenantId).paymentAttempt.update({
      where: { id: attempt.id },
      data: { razorpayOrderId, status: "CREATED" },
    });

    return {
      orderId: razorpayOrderId,
      amountPaise: tax.totalPaise,
      currency: "INR",
      keyId: credentials.keyId,
      buyerName: tenant.name,
      buyerEmail: membership.email,
      planName: plan.name,
      attemptId: attempt.id,
    };
  } catch (error) {
    await systemTenantDatabase(membership.tenantId).paymentAttempt.updateMany({
      where: { id: attempt.id, status: "CREATING" },
      data: { status: "FAILED", failureReason: en.errors.checkoutFailed },
    });
    if (error instanceof SubscriptionCheckoutError) throw error;
    console.error("[checkout] order creation failed", {
      name: error instanceof Error ? error.name : "unknown",
      code: (error as { code?: string })?.code,
    });
    throw new SubscriptionCheckoutError(en.errors.checkoutFailed);
  }
}
