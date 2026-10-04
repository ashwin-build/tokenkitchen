import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PlanCode } from "@/generated/prisma/client";
import { platformPrisma, systemTenantDatabase, tenantDatabase } from "@/server/db/prisma";
import { createRazorpayOrderForMembership } from "@/server/billing/razorpay-orders";
import { processRazorpaySubscriptionWebhook } from "@/server/billing/razorpay-webhook";

type Fixture = { tenantId: string; ownerId: string; subscriptionId: string };

const webhookSecret = "phase-six-test-webhook-secret";
const validGstin = "29ABCDE1234F1Z5";
const testRunId = crypto.randomUUID().slice(0, 8);
const ownerMembership = (fixture: Fixture) => ({ tenantId: fixture.tenantId, role: "OWNER" as const, clerkUserId: fixture.ownerId, email: `${fixture.ownerId}@billing.test` });

async function createTenant(name: string, period: "expired" | "active"): Promise<Fixture> {
  const suffix = crypto.randomUUID();
  const tenant = await platformPrisma.tenant.create({
    data: { name, slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${suffix.slice(0, 8)}` },
  });
  const userId = `user_${suffix.replaceAll("-", "").slice(0, 20)}`;
  await platformPrisma.membership.create({
    data: { tenantId: tenant.id, clerkUserId: userId, email: `${suffix}@billing.test`, role: "OWNER" },
  });
  const now = new Date("2026-10-04T12:00:00.000Z");
  const currentPeriodEndsAt = period === "active" ? new Date("2026-11-03T12:00:00.000Z") : null;
  const subscription = await platformPrisma.subscription.create({
    data: period === "expired"
      ? { tenantId: tenant.id, status: "TRIALING", trialStartedAt: new Date("2026-09-01T00:00:00.000Z"), trialEndsAt: new Date("2026-09-15T00:00:00.000Z") }
      : { tenantId: tenant.id, status: "ACTIVE", currentPeriodStartedAt: now, currentPeriodEndsAt },
  });
  return { tenantId: tenant.id, ownerId: userId, subscriptionId: subscription.id };
}

function signedEvent(event: unknown, eventId: string) {
  const rawBody = Buffer.from(JSON.stringify(event));
  const signature = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return { rawBody, signature, eventId };
}

function stubRazorpayOrder(orderId: string, amount = 69900) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: orderId, amount, currency: "INR" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Razorpay one-time subscription billing", () => {
  let expiredTenant: Fixture;
  let activeTenant: Fixture;
  const originalEnv = {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
    sellerName: process.env.SELLER_NAME,
    sellerAddress: process.env.SELLER_ADDRESS,
    sellerGstin: process.env.SELLER_GSTIN,
  };

  beforeAll(async () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_tokenkitchen";
    process.env.RAZORPAY_KEY_SECRET = "phase-six-test-key-secret";
    process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
    process.env.SELLER_NAME = "TokenKitchen Test Seller";
    process.env.SELLER_ADDRESS = "Mumbai, Maharashtra";
    process.env.SELLER_GSTIN = validGstin;
    expiredTenant = await createTenant("Subscription expired buyer", "expired");
    activeTenant = await createTenant("Subscription active buyer", "active");
  });

  afterAll(async () => {
    for (const [key, value] of Object.entries({
      RAZORPAY_KEY_ID: originalEnv.keyId,
      RAZORPAY_KEY_SECRET: originalEnv.keySecret,
      RAZORPAY_WEBHOOK_SECRET: originalEnv.webhookSecret,
      SELLER_NAME: originalEnv.sellerName,
      SELLER_ADDRESS: originalEnv.sellerAddress,
      SELLER_GSTIN: originalEnv.sellerGstin,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await platformPrisma.$disconnect();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("creates a TEST Razorpay order with tenant/plan notes and activates an expired tenant only through its signed webhook", async () => {
    const plan = await platformPrisma.planCatalog.findUniqueOrThrow({ where: { code: PlanCode.QUARTERLY } });
    let capturedBody = "";
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      capturedBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ id: `order_test_expired_${testRunId}`, amount: 69900, currency: "INR" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const checkout = await createRazorpayOrderForMembership(ownerMembership(expiredTenant), {
      planId: plan.id,
      clientRequestKey: crypto.randomUUID(),
      gstin: validGstin,
    });
    expect(checkout).toMatchObject({ orderId: `order_test_expired_${testRunId}`, amountPaise: 69900, keyId: "rzp_test_tokenkitchen" });
    expect(JSON.parse(capturedBody)).toMatchObject({
      amount: 69900,
      currency: "INR",
      notes: { tenantId: expiredTenant.tenantId, planId: plan.id },
    });
    expect(fetchMock).toHaveBeenCalledOnce();

    const attempt = await tenantDatabase(expiredTenant.tenantId).paymentAttempt.findUniqueOrThrow({
      where: { razorpayOrderId: checkout.orderId },
    });
    expect(attempt.status).toBe("CREATED");
    expect((await platformPrisma.subscription.findUniqueOrThrow({ where: { id: expiredTenant.subscriptionId } })).status).toBe("TRIALING");

    const paidAt = new Date("2026-10-04T12:00:00.000Z");
    const paidEvent = {
      event: "order.paid",
      payload: {
        order: { entity: { id: checkout.orderId, amount_paid: 69900, notes: { tenantId: expiredTenant.tenantId, planId: plan.id } } },
        payment: { entity: { id: `pay_test_expired_${testRunId}`, order_id: checkout.orderId, amount: 69900 } },
      },
    };
    const signed = signedEvent(paidEvent, "evt_test_order_paid_expired");
    await expect(processRazorpaySubscriptionWebhook(signed.rawBody, signed.signature, signed.eventId, paidAt))
      .resolves.toMatchObject({ processed: true, replayed: false });

    const activated = await platformPrisma.subscription.findUniqueOrThrow({ where: { id: expiredTenant.subscriptionId } });
    expect(activated).toMatchObject({ status: "ACTIVE", currentPeriodStartedAt: paidAt });
    expect(activated.currentPeriodEndsAt?.toISOString()).toBe("2027-01-02T12:00:00.000Z");
    const invoice = await tenantDatabase(expiredTenant.tenantId).subscriptionInvoice.findUniqueOrThrow({ where: { paymentAttemptId: attempt.id } });
    expect(invoice).toMatchObject({ buyerBusinessName: "Subscription expired buyer", buyerGstin: validGstin, taxableAmountPaise: 59237, cgstPaise: 5331, sgstPaise: 5332, totalPaise: 69900 });
    expect(invoice.invoiceNumber).toMatch(/^TK-SUB\/2026-27\/\d{6}$/);

    const duplicate = await processRazorpaySubscriptionWebhook(signed.rawBody, signed.signature, signed.eventId, paidAt);
    expect(duplicate).toMatchObject({ processed: false, replayed: true });
    expect(await tenantDatabase(expiredTenant.tenantId).subscriptionInvoice.count()).toBe(1);
    const storedEvent = await systemTenantDatabase(expiredTenant.tenantId).webhookEvent.findUniqueOrThrow({
      where: { tenantId_provider_idempotencyKey: { tenantId: expiredTenant.tenantId, provider: "RAZORPAY", idempotencyKey: signed.eventId } },
    });
    expect(Buffer.from(storedEvent.rawBody).equals(signed.rawBody)).toBe(true);
  });

  it("accepts payment.captured as backup, extends from the active period end, and uses the platform-wide invoice counter", async () => {
    const plan = await platformPrisma.planCatalog.findUniqueOrThrow({ where: { code: PlanCode.QUARTERLY } });
    stubRazorpayOrder(`order_test_active_${testRunId}`);
    const checkout = await createRazorpayOrderForMembership(ownerMembership(activeTenant), {
      planId: plan.id,
      clientRequestKey: crypto.randomUUID(),
    });
    const paidAt = new Date("2026-10-04T12:00:00.000Z");
    const paymentEvent = {
      event: "payment.captured",
      payload: {
        payment: { entity: { id: `pay_test_active_${testRunId}`, order_id: checkout.orderId, amount: 69900 } },
      },
    };
    const signed = signedEvent(paymentEvent, "evt_test_payment_captured_active");
    await expect(processRazorpaySubscriptionWebhook(signed.rawBody, signed.signature, signed.eventId, paidAt))
      .resolves.toMatchObject({ processed: true, replayed: false });

    const subscription = await platformPrisma.subscription.findUniqueOrThrow({ where: { id: activeTenant.subscriptionId } });
    expect(subscription.currentPeriodStartedAt?.toISOString()).toBe("2026-11-03T12:00:00.000Z");
    expect(subscription.currentPeriodEndsAt?.toISOString()).toBe("2027-02-01T12:00:00.000Z");
    const invoice = await tenantDatabase(activeTenant.tenantId).subscriptionInvoice.findUniqueOrThrow({ where: { paymentAttemptId: checkout.attemptId } });
    expect(Number(invoice.invoiceNumber.split("/").at(-1))).toBeGreaterThan(1);
    expect(invoice.invoiceNumber).toContain("2026-27");
  });

  it("does not activate a subscription if the signed captured amount differs from the plan charge", async () => {
    const plan = await platformPrisma.planCatalog.findUniqueOrThrow({ where: { code: PlanCode.ANNUAL } });
    stubRazorpayOrder(`order_test_wrong_amount_${testRunId}`, 219900);
    const checkout = await createRazorpayOrderForMembership(ownerMembership(activeTenant), {
      planId: plan.id,
      clientRequestKey: crypto.randomUUID(),
    });
    const paymentEvent = {
      event: "payment.captured",
      payload: { payment: { entity: { id: `pay_test_wrong_amount_${testRunId}`, order_id: checkout.orderId, amount: 1 } } },
    };
    const signed = signedEvent(paymentEvent, "evt_test_wrong_amount");
    await expect(processRazorpaySubscriptionWebhook(signed.rawBody, signed.signature, signed.eventId))
      .resolves.toMatchObject({ processed: false, replayed: false });
    const attempt = await tenantDatabase(activeTenant.tenantId).paymentAttempt.findUniqueOrThrow({ where: { razorpayOrderId: checkout.orderId } });
    expect(attempt.status).toBe("FAILED");
  });
});
