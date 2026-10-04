import { Prisma } from "@/generated/prisma/client";
import { SubscriptionWriteBlockedError, canWriteWithSubscription } from "@/server/db/subscription-guard";
import { en } from "@/i18n/en";

const tenantModels = new Set([
  "Membership",
  "Ingredient",
  "Dish",
  "RecipeLine",
  "Order",
  "OrderItem",
  "SequenceCounter",
  "OrderAuditEvent",
  "Payment",
  "Purchase",
  "PurchaseItem",
  "StockMovement",
  "Party",
  "LedgerEntry",
  "Expense",
  "Subscription",
  "SubscriptionPayment",
  "PaymentAttempt",
  "SubscriptionInvoice",
  "IntegrationConnection",
  "WebhookEvent",
]);

const writeOperations = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);

const systemWriteModels = new Set(["Subscription", "WebhookEvent", "SubscriptionInvoice"]);

export type QueryArguments = {
  where?: Record<string, unknown>;
  data?: unknown;
  create?: unknown;
  update?: unknown;
};

export class SystemWriteNotAllowedError extends Error {
  constructor() {
    super(en.errors.systemWriteDenied);
    this.name = "SystemWriteNotAllowedError";
  }
}

function setTenantOnData(data: unknown, tenantId: string): unknown {
  if (Array.isArray(data)) {
    return data.map((entry) => setTenantOnData(entry, tenantId));
  }

  if (typeof data !== "object" || data === null) {
    return data;
  }

  return { ...data, tenantId };
}

export function scopeArguments(args: QueryArguments, operation: string, tenantId: string): QueryArguments {
  const scoped = { ...args };

  if (operation === "create" || operation === "createMany" || operation === "createManyAndReturn") {
    scoped.data = setTenantOnData(scoped.data, tenantId);
  }

  if (operation === "upsert") {
    scoped.create = setTenantOnData(scoped.create, tenantId);
    scoped.update = setTenantOnData(scoped.update, tenantId);
  } else if (operation === "update" || operation === "updateMany" || operation === "updateManyAndReturn") {
    scoped.data = setTenantOnData(scoped.data, tenantId);
  }

  if (scoped.where) {
    scoped.where = { ...scoped.where, tenantId };
  } else if (operation !== "create" && operation !== "createMany" && operation !== "createManyAndReturn") {
    scoped.where = { tenantId };
  }

  return scoped;
}

export function scopeTenantRootArguments(args: QueryArguments, operation: string, tenantId: string): QueryArguments {
  const scoped = { ...args };
  if (writeOperations.has(operation)) {
    if (operation !== "update" && operation !== "updateMany") throw new SystemWriteNotAllowedError();
    if (typeof args.data !== "object" || args.data === null) throw new SystemWriteNotAllowedError();
    const allowedFields = new Set(["stockMode", "pricesIncludeGst"]);
    if (Object.keys(args.data).some((field) => !allowedFields.has(field))) throw new SystemWriteNotAllowedError();
  }
  const { id: requestedId, ...otherFilters } = args.where ?? {};
  return {
    ...scoped,
    where: {
      ...otherFilters,
      id: tenantId,
      ...(requestedId === undefined ? {} : { AND: [{ id: requestedId }] }),
    },
  };
}

export function tenantScopeExtension(
  tenantId: string,
  assertWriteAllowed?: () => Promise<{
    status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
    trialEndsAt: Date | null;
    currentPeriodEndsAt: Date | null;
  } | null>,
) {
  if (!tenantId.trim()) {
    throw new Error("A tenant ID is required to create a scoped database client");
  }

  return Prisma.defineExtension({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (model === "PlatformSequenceCounter") {
            if (assertWriteAllowed || (writeOperations.has(operation) && operation !== "upsert")) {
              throw new SystemWriteNotAllowedError();
            }
            return query(args);
          }

          if (model === "Tenant") {
            if (writeOperations.has(operation)) {
              if (!assertWriteAllowed) throw new SystemWriteNotAllowedError();
              const subscription = await assertWriteAllowed();
              if (!canWriteWithSubscription(subscription)) throw new SubscriptionWriteBlockedError();
            }
            const scopedArgs = scopeTenantRootArguments(args as QueryArguments, operation, tenantId);
            return query(scopedArgs as typeof args);
          }

          if (!tenantModels.has(model)) {
            return query(args);
          }

          if (writeOperations.has(operation) && model === "PaymentAttempt") {
            if (assertWriteAllowed && operation !== "create") throw new SystemWriteNotAllowedError();
            if (!assertWriteAllowed && !["create", "update", "updateMany"].includes(operation)) {
              throw new SystemWriteNotAllowedError();
            }
          }

          if (writeOperations.has(operation) && systemWriteModels.has(model) && assertWriteAllowed) {
            throw new SystemWriteNotAllowedError();
          }

          if (writeOperations.has(operation) && systemWriteModels.has(model) && !assertWriteAllowed) {
            const allowed = model === "SubscriptionInvoice"
              ? operation === "create"
              : ["create", "update", "updateMany", "upsert"].includes(operation);
            if (!allowed) throw new SystemWriteNotAllowedError();
          }

          if (writeOperations.has(operation) && model !== "PaymentAttempt" && !systemWriteModels.has(model)) {
            if (!assertWriteAllowed) {
              throw new SystemWriteNotAllowedError();
            }
            const subscription = await assertWriteAllowed();
            if (!canWriteWithSubscription(subscription)) {
              throw new SubscriptionWriteBlockedError();
            }
          }

          const scopedArgs = scopeArguments(args as QueryArguments, operation, tenantId);
          return query(scopedArgs as typeof args);
        },
      },
    },
  });
}