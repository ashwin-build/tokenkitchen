-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'MANAGER', 'CASHIER');

-- CreateEnum
CREATE TYPE "TaxMode" AS ENUM ('INCLUSIVE', 'EXCLUSIVE');

-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('COUNTER', 'SWIGGY', 'ZOMATO', 'OTHER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'UPI', 'CARD', 'BANK', 'PLATFORM_SETTLEMENT');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE', 'SALE', 'WASTAGE', 'ADJUSTMENT', 'RETURN');

-- CreateEnum
CREATE TYPE "PartyType" AS ENUM ('CUSTOMER', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('RENT', 'SALARIES', 'UTILITIES', 'SUPPLIES', 'MARKETING', 'MAINTENANCE', 'TRANSPORT', 'TAXES', 'OTHER');

-- CreateEnum
CREATE TYPE "PlanCode" AS ENUM ('QUARTERLY', 'HALF_YEARLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('RAZORPAY');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('SWIGGY', 'ZOMATO');

-- CreateEnum
CREATE TYPE "WebhookProvider" AS ENUM ('RAZORPAY', 'SWIGGY', 'ZOMATO');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "gstin" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "businessDayCutoffMinutes" INTEGER NOT NULL DEFAULT 240,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "role" "MembershipRole" NOT NULL DEFAULT 'CASHIER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "currentStock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "lowStockThreshold" DECIMAL(12,3),
    "unitCostPaise" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dish" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pricePaise" INTEGER NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Dish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantityPerDish" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "RecipeLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tokenNo" INTEGER NOT NULL,
    "businessDate" DATE NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "financialYear" VARCHAR(9) NOT NULL,
    "channel" "OrderChannel" NOT NULL DEFAULT 'COUNTER',
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "taxMode" "TaxMode" NOT NULL,
    "subtotalPaise" INTEGER NOT NULL,
    "cgstPaise" INTEGER NOT NULL DEFAULT 0,
    "sgstPaise" INTEGER NOT NULL DEFAULT 0,
    "totalPaise" INTEGER NOT NULL,
    "paidPaise" INTEGER NOT NULL DEFAULT 0,
    "partyId" TEXT,
    "externalOrderId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "dishName" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPricePaise" INTEGER NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "taxableAmountPaise" INTEGER NOT NULL,
    "cgstPaise" INTEGER NOT NULL DEFAULT 0,
    "sgstPaise" INTEGER NOT NULL DEFAULT 0,
    "totalPaise" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "providerRef" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "orderId" TEXT,
    "type" "StockMovementType" NOT NULL,
    "quantityDelta" DECIMAL(12,3) NOT NULL,
    "unitCostPaise" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "PartyType" NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partyId" TEXT,
    "orderId" TEXT,
    "direction" "LedgerDirection" NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partyId" TEXT,
    "category" "ExpenseCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "subtotalPaise" INTEGER NOT NULL,
    "cgstPaise" INTEGER NOT NULL DEFAULT 0,
    "sgstPaise" INTEGER NOT NULL DEFAULT 0,
    "totalPaise" INTEGER NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanCatalog" (
    "id" TEXT NOT NULL,
    "code" "PlanCode" NOT NULL,
    "name" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "gstInclusive" BOOLEAN NOT NULL DEFAULT true,
    "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 18.00,
    "taxReviewRequired" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PlanCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planCatalogId" TEXT,
    "status" "SubscriptionStatus" NOT NULL,
    "provider" "PaymentProvider",
    "providerCustomerId" TEXT,
    "providerSubscriptionId" TEXT,
    "billingGstin" TEXT,
    "trialStartedAt" TIMESTAMPTZ(6),
    "trialEndsAt" TIMESTAMPTZ(6),
    "currentPeriodStartedAt" TIMESTAMPTZ(6),
    "currentPeriodEndsAt" TIMESTAMPTZ(6),
    "canceledAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "providerPaymentId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "taxableAmountPaise" INTEGER NOT NULL,
    "gstAmountPaise" INTEGER NOT NULL,
    "gstInclusive" BOOLEAN NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "customerGstin" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "financialYear" VARCHAR(9) NOT NULL,
    "paidAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "credentialsCiphertext" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "WebhookProvider" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "rawBody" BYTEA NOT NULL,
    "signature" TEXT,
    "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "receivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(6),
    "failureReason" TEXT,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Membership_clerkUserId_isActive_idx" ON "Membership"("clerkUserId", "isActive");

-- CreateIndex
CREATE INDEX "Membership_tenantId_isActive_idx" ON "Membership"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_tenantId_id_key" ON "Membership"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_tenantId_clerkUserId_key" ON "Membership"("tenantId", "clerkUserId");

-- CreateIndex
CREATE INDEX "Ingredient_tenantId_isActive_idx" ON "Ingredient"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_tenantId_id_key" ON "Ingredient"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_tenantId_name_key" ON "Ingredient"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Dish_tenantId_isActive_idx" ON "Dish"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Dish_tenantId_id_key" ON "Dish"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Dish_tenantId_name_key" ON "Dish"("tenantId", "name");

-- CreateIndex
CREATE INDEX "RecipeLine_tenantId_ingredientId_idx" ON "RecipeLine"("tenantId", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeLine_tenantId_id_key" ON "RecipeLine"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeLine_tenantId_dishId_ingredientId_key" ON "RecipeLine"("tenantId", "dishId", "ingredientId");

-- CreateIndex
CREATE INDEX "Order_tenantId_createdAt_idx" ON "Order"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_tenantId_status_createdAt_idx" ON "Order"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantId_id_key" ON "Order"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantId_businessDate_tokenNo_key" ON "Order"("tenantId", "businessDate", "tokenNo");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantId_financialYear_invoiceNo_key" ON "Order"("tenantId", "financialYear", "invoiceNo");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantId_channel_externalOrderId_key" ON "Order"("tenantId", "channel", "externalOrderId");

-- CreateIndex
CREATE INDEX "OrderItem_tenantId_orderId_idx" ON "OrderItem"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "OrderItem_tenantId_dishId_idx" ON "OrderItem"("tenantId", "dishId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_tenantId_id_key" ON "OrderItem"("tenantId", "id");

-- CreateIndex
CREATE INDEX "Payment_tenantId_orderId_createdAt_idx" ON "Payment"("tenantId", "orderId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_tenantId_mode_createdAt_idx" ON "Payment"("tenantId", "mode", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_tenantId_id_key" ON "Payment"("tenantId", "id");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_ingredientId_createdAt_idx" ON "StockMovement"("tenantId", "ingredientId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_orderId_idx" ON "StockMovement"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_type_createdAt_idx" ON "StockMovement"("tenantId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_tenantId_id_key" ON "StockMovement"("tenantId", "id");

-- CreateIndex
CREATE INDEX "Party_tenantId_type_name_idx" ON "Party"("tenantId", "type", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Party_tenantId_id_key" ON "Party"("tenantId", "id");

-- CreateIndex
CREATE INDEX "LedgerEntry_tenantId_partyId_occurredAt_idx" ON "LedgerEntry"("tenantId", "partyId", "occurredAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_tenantId_orderId_idx" ON "LedgerEntry"("tenantId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_tenantId_id_key" ON "LedgerEntry"("tenantId", "id");

-- CreateIndex
CREATE INDEX "Expense_tenantId_occurredAt_idx" ON "Expense"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "Expense_tenantId_category_occurredAt_idx" ON "Expense"("tenantId", "category", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_tenantId_id_key" ON "Expense"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PlanCatalog_code_key" ON "PlanCatalog"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key" ON "Subscription"("providerSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_tenantId_status_idx" ON "Subscription"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_tenantId_id_key" ON "Subscription"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPayment_providerPaymentId_key" ON "SubscriptionPayment"("providerPaymentId");

-- CreateIndex
CREATE INDEX "SubscriptionPayment_tenantId_paidAt_idx" ON "SubscriptionPayment"("tenantId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPayment_tenantId_id_key" ON "SubscriptionPayment"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPayment_tenantId_financialYear_invoiceNumber_key" ON "SubscriptionPayment"("tenantId", "financialYear", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_tenantId_id_key" ON "IntegrationConnection"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_tenantId_provider_key" ON "IntegrationConnection"("tenantId", "provider");

-- CreateIndex
CREATE INDEX "WebhookEvent_tenantId_status_receivedAt_idx" ON "WebhookEvent"("tenantId", "status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_tenantId_id_provider_key" ON "WebhookEvent"("tenantId", "id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_tenantId_provider_idempotencyKey_key" ON "WebhookEvent"("tenantId", "provider", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dish" ADD CONSTRAINT "Dish_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_tenantId_dishId_fkey" FOREIGN KEY ("tenantId", "dishId") REFERENCES "Dish"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_tenantId_ingredientId_fkey" FOREIGN KEY ("tenantId", "ingredientId") REFERENCES "Ingredient"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "Order"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_tenantId_dishId_fkey" FOREIGN KEY ("tenantId", "dishId") REFERENCES "Dish"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "Order"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenantId_ingredientId_fkey" FOREIGN KEY ("tenantId", "ingredientId") REFERENCES "Ingredient"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planCatalogId_fkey" FOREIGN KEY ("planCatalogId") REFERENCES "PlanCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_tenantId_subscriptionId_fkey" FOREIGN KEY ("tenantId", "subscriptionId") REFERENCES "Subscription"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
