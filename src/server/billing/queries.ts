import { platformPrisma, tenantDatabase } from "@/server/db/prisma";
import { currentBillingMembership } from "@/server/billing/access";
import { canWriteWithSubscription } from "@/server/db/subscription-guard";
import { calculateSubscriptionTax } from "@/server/billing/subscription-tax";
import { z } from "zod";

export async function getBillingPageData(now = new Date()) {
  const membership = await currentBillingMembership();
  const database = tenantDatabase(membership.tenantId);
  const [tenant, subscription, plans, invoices, latestAttempt] = await Promise.all([
    database.tenant.findUniqueOrThrow({ where: { id: membership.tenantId }, select: { id: true, name: true, gstin: true } }),
    database.subscription.findFirst({
      where: { tenantId: membership.tenantId },
      include: { planCatalog: { select: { name: true, periodDays: true } } },
      orderBy: { createdAt: "desc" },
    }),
    platformPrisma.planCatalog.findMany({ where: { isActive: true }, orderBy: { amountPaise: "asc" } }),
    database.subscriptionInvoice.findMany({
      orderBy: { paidAt: "desc" },
      take: 12,
      select: { id: true, invoiceNumber: true, totalPaise: true, paidAt: true, buyerGstin: true },
    }),
    database.paymentAttempt.findFirst({ orderBy: { createdAt: "desc" }, select: { status: true, createdAt: true } }),
  ]);

  const endAt = subscription?.status === "TRIALING"
    ? subscription.trialEndsAt
    : subscription?.currentPeriodEndsAt ?? subscription?.trialEndsAt;
  const daysRemaining = endAt ? Math.ceil((endAt.getTime() - now.getTime()) / 86400000) : 0;
  const active = canWriteWithSubscription(subscription ? {
    status: subscription.status,
    trialEndsAt: subscription.trialEndsAt,
    currentPeriodEndsAt: subscription.currentPeriodEndsAt,
  } : null, now);

  return {
    membership,
    tenant,
    current: subscription ? {
      status: subscription.status,
      planName: subscription.planCatalog?.name ?? null,
      endAt: endAt?.toISOString() ?? null,
      daysRemaining: Math.max(0, daysRemaining),
      active,
    } : { status: "EXPIRED" as const, planName: null, endAt: null, daysRemaining: 0, active: false },
    plans: plans.map((plan) => {
      const tax = calculateSubscriptionTax(plan.amountPaise, plan.gstInclusive, Number(plan.gstRate));
      return {
        id: plan.id,
        name: plan.name,
        periodDays: plan.periodDays,
        pricePaise: plan.amountPaise,
        gstInclusive: plan.gstInclusive,
        gstRate: plan.gstRate.toString(),
        totalPaise: tax.totalPaise,
        taxableAmountPaise: tax.taxableAmountPaise,
      };
    }),
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      totalPaise: invoice.totalPaise,
      paidAt: invoice.paidAt.toISOString(),
      buyerGstin: invoice.buyerGstin,
    })),
    latestAttempt: latestAttempt ? { status: latestAttempt.status, createdAt: latestAttempt.createdAt.toISOString() } : null,
  };
}

export async function getSubscriptionInvoice(invoiceId: string) {
  const membership = await currentBillingMembership();
  const database = tenantDatabase(membership.tenantId);
  const [tenant, invoice] = await Promise.all([
    database.tenant.findUniqueOrThrow({ where: { id: membership.tenantId }, select: { name: true } }),
    database.subscriptionInvoice.findUnique({ where: { id: invoiceId } }),
  ]);
  return invoice ? { tenantName: tenant.name, invoice } : null;
}

import { getBusinessDate } from "@/server/billing/business-time";

const orderStatusSchema = z.enum(["PREPARING", "READY", "COMPLETED", "CANCELLED"]);
const dateSchema = z.iso.date();

export type OrdersFilter = {
  date?: string;
  status?: string;
  paymentState?: string;
  search?: string;
};

export async function getCounterData() {
  const membership = await currentBillingMembership();
  const database = tenantDatabase(membership.tenantId);
  const [tenant, dishes, customers] = await Promise.all([
    database.tenant.findUniqueOrThrow({ where: { id: membership.tenantId } }),
    database.dish.findMany({
      where: { isActive: true },
      include: {
        recipeLines: {
          include: {
            ingredient: { select: { id: true, name: true, unit: true, currentStock: true, isActive: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    database.party.findMany({
      where: { type: "CUSTOMER", isActive: true },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
      take: 100,
    }),
  ]);

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      gstin: tenant.gstin,
      pricesIncludeGst: tenant.pricesIncludeGst,
      stockMode: tenant.stockMode,
    },
    role: membership.role,
    dishes: dishes.map((dish) => ({
      id: dish.id,
      name: dish.name,
      pricePaise: dish.pricePaise,
      gstRate: dish.gstRate,
      recipe: dish.recipeLines.map((line) => ({
        ingredientId: line.ingredientId,
        ingredientName: line.ingredient.name,
        quantityPerDish: line.quantityPerDish.toString(),
        unit: line.ingredient.unit.toLowerCase(),
        currentStock: line.ingredient.currentStock.toString(),
        isActive: line.ingredient.isActive,
      })),
    })),
    customers,
  };
}

export async function listOrders(filters: OrdersFilter = {}) {
  const membership = await currentBillingMembership();
  const database = tenantDatabase(membership.tenantId);
  const tenant = await database.tenant.findUniqueOrThrow({ where: { id: membership.tenantId } });
  const dateValue = filters.date && dateSchema.safeParse(filters.date).success
    ? filters.date
    : getBusinessDate(new Date(), tenant.timezone, tenant.businessDayCutoffMinutes);
  const parsedStatus = orderStatusSchema.safeParse(filters.status);
  const paymentState = z.enum(["all", "paid", "due"]).safeParse(filters.paymentState).success
    ? filters.paymentState
    : "all";
  const search = z.string().trim().max(100).safeParse(filters.search ?? "").success ? filters.search?.trim() : "";
  const numericToken = search && /^\d+$/.test(search) ? Number(search) : undefined;

  const orders = await database.order.findMany({
    where: {
      businessDate: new Date(`${dateValue}T00:00:00.000Z`),
      ...(parsedStatus.success ? { status: parsedStatus.data } : {}),
      ...(search ? {
        OR: [
          { invoiceNo: { contains: search, mode: "insensitive" as const } },
          ...(numericToken === undefined ? [] : [{ tokenNo: numericToken }]),
        ],
      } : {}),
    },
    include: {
      party: { select: { name: true } },
      payments: { select: { mode: true, amountPaise: true, changePaise: true } },
      items: { select: { dishName: true, quantity: true } },
    },
    orderBy: [{ createdAt: "desc" }, { tokenNo: "desc" }],
  });

  return {
    tenantName: tenant.name,
    date: dateValue,
    membership,
    orders: orders.filter((order) => paymentState !== "paid" || order.paidPaise >= order.totalPaise)
      .filter((order) => paymentState !== "due" || order.paidPaise < order.totalPaise)
      .map((order) => ({
        id: order.id,
        tokenNo: order.tokenNo,
        invoiceNo: order.invoiceNo,
        status: order.status,
        totalPaise: order.totalPaise,
        paidPaise: order.paidPaise,
        balancePaise: order.totalPaise - order.paidPaise,
        stockShortage: order.stockShortage,
        partyName: order.party?.name ?? null,
        createdAt: order.createdAt.toISOString(),
        items: order.items.map((item) => ({ name: item.dishName, quantity: item.quantity.toString() })),
        payments: order.payments,
      })),
  };
}

export async function getOrderPrintData(orderId: unknown) {
  const id = z.string().cuid().parse(orderId);
  const membership = await currentBillingMembership();
  const database = tenantDatabase(membership.tenantId);
  const [tenant, order] = await Promise.all([
    database.tenant.findUniqueOrThrow({ where: { id: membership.tenantId } }),
    database.order.findUnique({
      where: { id },
      include: {
        items: { orderBy: { createdAt: "asc" } },
        payments: { orderBy: { createdAt: "asc" } },
        party: { select: { name: true, gstin: true } },
      },
    }),
  ]);
  if (!order) return null;

  return {
    tenant: { name: tenant.name, gstin: tenant.gstin },
    order: {
      id: order.id,
      tokenNo: order.tokenNo,
      invoiceNo: order.invoiceNo,
      businessDate: order.businessDate.toISOString().slice(0, 10),
      createdAt: order.createdAt.toISOString(),
      status: order.status,
      subtotalPaise: order.subtotalPaise,
      cgstPaise: order.cgstPaise,
      sgstPaise: order.sgstPaise,
      roundOffPaise: order.roundOffPaise,
      totalPaise: order.totalPaise,
      paidPaise: order.paidPaise,
      balancePaise: order.totalPaise - order.paidPaise,
      taxMode: order.taxMode,
      cancelReason: order.cancelReason,
      party: order.party,
      items: order.items.map((item) => ({
        dishName: item.dishName,
        quantity: item.quantity.toString(),
        unit: item.unit,
        unitPricePaise: item.unitPricePaise,
        gstRate: Number(item.gstRate),
        taxableAmountPaise: item.taxableAmountPaise,
        cgstPaise: item.cgstPaise,
        sgstPaise: item.sgstPaise,
        totalPaise: item.totalPaise,
      })),
      payments: order.payments.map((payment) => ({
        mode: payment.mode,
        amountPaise: payment.amountPaise,
        changePaise: payment.changePaise,
      })),
    },
  };
}