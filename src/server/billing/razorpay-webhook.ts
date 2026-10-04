import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { en } from "@/i18n/en";
import { platformPrisma, systemTenantDatabase } from "@/server/db/prisma";
import { getCalendarDate, getFinancialYear } from "@/server/billing/business-time";
import { razorpayCredentials } from "@/server/billing/razorpay-config";
import { z } from "zod";

const razorpayWebhookSchema = z.object({
  event: z.enum(["order.paid", "payment.captured"]),
  payload: z.object({
    order: z.object({
      entity: z.object({
        id: z.string().min(1),
        amount_paid: z.number().int().nonnegative().optional(),
        notes: z.record(z.string(), z.string()).optional(),
      }).optional(),
    }).optional(),
    payment: z.object({
      entity: z.object({
        id: z.string().min(1),
        order_id: z.string().min(1),
        amount: z.number().int().nonnegative(),
        notes: z.record(z.string(), z.string()).optional(),
      }).optional(),
    }).optional(),
  }),
});

export class RazorpayWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RazorpayWebhookError";
  }
}

type ParsedEvent = z.infer<typeof razorpayWebhookSchema>;

function parseGatewayEvent(event: ParsedEvent) {
  const order = event.payload.order?.entity;
  const payment = event.payload.payment?.entity;
  const orderId = order?.id ?? payment?.order_id;
  const amountPaidPaise = event.event === "order.paid"
    ? order?.amount_paid ?? payment?.amount
    : payment?.amount;
  const notes = order?.notes ?? payment?.notes;

  if (!orderId || amountPaidPaise === undefined) {
    throw new RazorpayWebhookError(en.errors.orderNotPaid);
  }

  return {
    orderId,
    amountPaidPaise,
    paymentId: payment?.id,
    notes,
  };
}

async function nextPlatformInvoiceNumber(transaction: Parameters<Parameters<ReturnType<typeof systemTenantDatabase>["$transaction"]>[0]>[0], financialYear: string) {
  const counter = await transaction.platformSequenceCounter.upsert({
    where: { financialYear },
    create: { financialYear, value: 1 },
    update: { value: { increment: 1 } },
    select: { value: true },
  });
  const shortYear = `${financialYear.slice(0, 4)}-${financialYear.slice(-2)}`;
  return `TK-SUB/${shortYear}/${String(counter.value).padStart(6, "0")}`;
}

function nextPeriodStart(now: Date, periodEnds: (Date | null)[]): Date {
  const previousEnd = periodEnds.filter((date): date is Date => date !== null)
    .reduce<Date | null>((latest, date) => !latest || date > latest ? date : latest, null);
  return previousEnd && previousEnd > now ? previousEnd : now;
}

export async function processRazorpaySubscriptionWebhook(
  rawBody: Uint8Array,
  signature: string,
  eventId: string,
  now = new Date(),
) {
  const credentials = razorpayCredentials(true);
  const suppliedSignature = Buffer.from(signature, "hex");
  const expectedSignature = createHmac("sha256", credentials.webhookSecret!).update(rawBody).digest();
  if (suppliedSignature.length !== expectedSignature.length || !timingSafeEqual(suppliedSignature, expectedSignature)) {
    throw new RazorpayWebhookError(en.errors.webhookInvalid);
  }
  if (!eventId.trim() || eventId.length > 200) throw new RazorpayWebhookError(en.errors.webhookEventMissing);

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(rawBody).toString("utf8"));
  } catch {
    throw new RazorpayWebhookError(en.errors.webhookInvalid);
  }
  const event = razorpayWebhookSchema.parse(decoded);
  const gateway = parseGatewayEvent(event);
  const attempt = await platformPrisma.paymentAttempt.findUnique({
    where: { razorpayOrderId: gateway.orderId },
    select: { id: true, tenantId: true },
  });
  if (!attempt) throw new RazorpayWebhookError(en.errors.webhookAttemptMissing);

  const database = systemTenantDatabase(attempt.tenantId);
  const eventKey = {
    tenantId_provider_idempotencyKey: {
      tenantId: attempt.tenantId,
      provider: "RAZORPAY" as const,
      idempotencyKey: eventId,
    },
  };

  return database.$transaction(async (transaction) => {
    const priorEvent = await transaction.webhookEvent.findUnique({ where: eventKey });
    if (priorEvent?.status === "PROCESSED") return { processed: false, replayed: true, invoiceNumber: null };

    await transaction.webhookEvent.upsert({
      where: eventKey,
      create: {
        tenantId: attempt.tenantId,
        provider: "RAZORPAY",
        idempotencyKey: eventId,
        rawBody: Buffer.from(rawBody),
        signature,
        status: "PROCESSING",
      },
      update: { rawBody: Buffer.from(rawBody), signature, status: "PROCESSING", failureReason: null },
    });

    await transaction.$queryRaw(Prisma.sql`
      SELECT "id" FROM "PaymentAttempt"
      WHERE "tenantId" = ${attempt.tenantId} AND "id" = ${attempt.id}
      FOR UPDATE
    `);
    const paymentAttempt = await transaction.paymentAttempt.findUnique({ where: { id: attempt.id } });
    if (!paymentAttempt) throw new RazorpayWebhookError(en.errors.webhookAttemptMissing);

    if (paymentAttempt.status === "PAID") {
      await transaction.webhookEvent.update({ where: eventKey, data: { status: "PROCESSED", processedAt: now } });
      return { processed: false, replayed: true, invoiceNumber: null };
    }
    if (paymentAttempt.status !== "CREATED") {
      await transaction.webhookEvent.update({
        where: eventKey,
        data: { status: "FAILED", failureReason: en.errors.orderNotPaid, processedAt: now },
      });
      return { processed: false, replayed: false, invoiceNumber: null };
    }

    if ((gateway.notes?.tenantId && gateway.notes.tenantId !== paymentAttempt.tenantId)
      || (gateway.notes?.planId && gateway.notes.planId !== paymentAttempt.planCatalogId)) {
      await transaction.paymentAttempt.update({ where: { id: paymentAttempt.id }, data: { status: "FAILED", failureReason: en.errors.orderNotPaid } });
      await transaction.webhookEvent.update({ where: eventKey, data: { status: "FAILED", failureReason: en.errors.orderNotPaid, processedAt: now } });
      return { processed: false, replayed: false, invoiceNumber: null };
    }

    if (gateway.amountPaidPaise !== paymentAttempt.amountPaise) {
      await transaction.paymentAttempt.update({ where: { id: paymentAttempt.id }, data: { status: "FAILED", failureReason: en.errors.paymentAmountMismatch } });
      await transaction.webhookEvent.update({ where: eventKey, data: { status: "FAILED", failureReason: en.errors.paymentAmountMismatch, processedAt: now } });
      return { processed: false, replayed: false, invoiceNumber: null };
    }

    const plan = await transaction.planCatalog.findUnique({ where: { id: paymentAttempt.planCatalogId } });
    if (!plan || !plan.isActive) {
      await transaction.paymentAttempt.update({ where: { id: paymentAttempt.id }, data: { status: "FAILED", failureReason: en.errors.planUnavailable } });
      await transaction.webhookEvent.update({ where: eventKey, data: { status: "FAILED", failureReason: en.errors.planUnavailable, processedAt: now } });
      return { processed: false, replayed: false, invoiceNumber: null };
    }

    const currentSubscription = await transaction.subscription.findFirst({
      orderBy: { createdAt: "desc" },
    });
    const periodStart = nextPeriodStart(now, [currentSubscription?.currentPeriodEndsAt ?? null, currentSubscription?.trialEndsAt ?? null]);
    const periodEnd = new Date(periodStart.getTime() + plan.periodDays * 24 * 60 * 60 * 1000);
    if (periodEnd <= periodStart) throw new RazorpayWebhookError(en.errors.billingPeriodInvalid);

    const subscription = currentSubscription
      ? await transaction.subscription.update({
          where: { id: currentSubscription.id },
          data: {
            planCatalogId: plan.id,
            status: "ACTIVE",
            provider: "RAZORPAY",
            billingGstin: paymentAttempt.buyerGstin,
            currentPeriodStartedAt: periodStart,
            currentPeriodEndsAt: periodEnd,
            canceledAt: null,
          },
        })
      : await transaction.subscription.create({
          data: {
            tenantId: attempt.tenantId,
            planCatalogId: plan.id,
            status: "ACTIVE",
            provider: "RAZORPAY",
            billingGstin: paymentAttempt.buyerGstin,
            currentPeriodStartedAt: periodStart,
            currentPeriodEndsAt: periodEnd,
          },
        });

    const financialYear = getFinancialYear(getCalendarDate(now, "Asia/Kolkata"));
    const invoiceNumber = await nextPlatformInvoiceNumber(transaction, financialYear.key);
    await transaction.subscriptionInvoice.create({
      data: {
        tenantId: attempt.tenantId,
        subscriptionId: subscription.id,
        paymentAttemptId: paymentAttempt.id,
        invoiceNumber,
        financialYear: financialYear.key,
        buyerBusinessName: paymentAttempt.buyerBusinessName,
        buyerGstin: paymentAttempt.buyerGstin,
        planName: plan.name,
        planAmountPaise: paymentAttempt.planAmountPaise,
        taxableAmountPaise: paymentAttempt.taxableAmountPaise,
        gstRate: paymentAttempt.gstRate,
        gstInclusive: paymentAttempt.gstInclusive,
        cgstPaise: paymentAttempt.cgstPaise,
        sgstPaise: paymentAttempt.sgstPaise,
        totalPaise: paymentAttempt.amountPaise,
        paidAt: now,
      },
    });

    await transaction.paymentAttempt.update({
      where: { id: paymentAttempt.id },
      data: { status: "PAID", razorpayPaymentId: gateway.paymentId, paidAt: now, subscriptionId: subscription.id },
    });
    await transaction.webhookEvent.update({ where: eventKey, data: { status: "PROCESSED", processedAt: now } });

    return { processed: true, replayed: false, invoiceNumber };
  }, { maxWait: 30000, timeout: 30000 });
}