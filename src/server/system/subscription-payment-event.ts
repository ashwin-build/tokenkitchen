import { z } from "zod";
import { systemTenantDatabase } from "@/server/db/prisma";

const simulatedSubscriptionPaymentSchema = z.object({
  tenantId: z.string().cuid(),
  subscriptionId: z.string().cuid(),
  eventId: z.string().trim().min(1).max(200),
  providerSubscriptionId: z.string().trim().min(1).max(200),
  currentPeriodStartedAt: z.coerce.date(),
  currentPeriodEndsAt: z.coerce.date(),
  rawBody: z.instanceof(Uint8Array),
}).refine((event) => event.currentPeriodEndsAt > event.currentPeriodStartedAt, {
  message: "The subscription period end must follow its start",
  path: ["currentPeriodEndsAt"],
});

export async function processSimulatedSubscriptionPayment(input: unknown) {
  const event = simulatedSubscriptionPaymentSchema.parse(input);
  const database = systemTenantDatabase(event.tenantId);
  const eventKey = {
    tenantId_provider_idempotencyKey: {
      tenantId: event.tenantId,
      provider: "RAZORPAY" as const,
      idempotencyKey: event.eventId,
    },
  };

  return database.$transaction(async (transaction) => {
    const existingEvent = await transaction.webhookEvent.findUnique({ where: eventKey });
    if (existingEvent?.status === "PROCESSED") {
      return { processed: false, replayed: true };
    }

    await transaction.webhookEvent.upsert({
      where: eventKey,
      create: {
        tenantId: event.tenantId,
        provider: "RAZORPAY",
        idempotencyKey: event.eventId,
        rawBody: event.rawBody,
        status: "PROCESSING",
      },
      update: { rawBody: event.rawBody, status: "PROCESSING", failureReason: null },
    });

    const updatedSubscription = await transaction.subscription.updateMany({
      where: { id: event.subscriptionId },
      data: {
        status: "ACTIVE",
        provider: "RAZORPAY",
        providerSubscriptionId: event.providerSubscriptionId,
        currentPeriodStartedAt: event.currentPeriodStartedAt,
        currentPeriodEndsAt: event.currentPeriodEndsAt,
      },
    });

    if (updatedSubscription.count !== 1) {
      throw new Error("The subscription for this payment event was not found");
    }

    await transaction.webhookEvent.update({
      where: eventKey,
      data: { status: "PROCESSED", processedAt: new Date() },
    });

    return { processed: true, replayed: false };
  });
}