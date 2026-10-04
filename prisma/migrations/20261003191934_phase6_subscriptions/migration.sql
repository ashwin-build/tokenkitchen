-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('CREATING', 'CREATED', 'PROCESSING', 'PAID', 'FAILED');

-- AlterTable
ALTER TABLE "PlanCatalog" ADD COLUMN     "periodDays" INTEGER NOT NULL DEFAULT 90;

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planCatalogId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "clientRequestKey" TEXT NOT NULL,
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'CREATING',
    "buyerBusinessName" TEXT NOT NULL,
    "buyerGstin" TEXT,
    "planAmountPaise" INTEGER NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "taxableAmountPaise" INTEGER NOT NULL,
    "gstAmountPaise" INTEGER NOT NULL,
    "cgstPaise" INTEGER NOT NULL,
    "sgstPaise" INTEGER NOT NULL,
    "gstInclusive" BOOLEAN NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "failureReason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMPTZ(6),

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSequenceCounter" (
    "id" TEXT NOT NULL,
    "financialYear" VARCHAR(9) NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PlatformSequenceCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "paymentAttemptId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "financialYear" VARCHAR(9) NOT NULL,
    "buyerBusinessName" TEXT NOT NULL,
    "buyerGstin" TEXT,
    "planName" TEXT NOT NULL,
    "planAmountPaise" INTEGER NOT NULL,
    "taxableAmountPaise" INTEGER NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "gstInclusive" BOOLEAN NOT NULL,
    "cgstPaise" INTEGER NOT NULL,
    "sgstPaise" INTEGER NOT NULL,
    "totalPaise" INTEGER NOT NULL,
    "paidAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_razorpayOrderId_key" ON "PaymentAttempt"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_razorpayPaymentId_key" ON "PaymentAttempt"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_tenantId_status_createdAt_idx" ON "PaymentAttempt"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_tenantId_id_key" ON "PaymentAttempt"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_tenantId_clientRequestKey_key" ON "PaymentAttempt"("tenantId", "clientRequestKey");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformSequenceCounter_financialYear_key" ON "PlatformSequenceCounter"("financialYear");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionInvoice_paymentAttemptId_key" ON "SubscriptionInvoice"("paymentAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionInvoice_invoiceNumber_key" ON "SubscriptionInvoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "SubscriptionInvoice_tenantId_financialYear_invoiceNumber_idx" ON "SubscriptionInvoice"("tenantId", "financialYear", "invoiceNumber");

-- CreateIndex
CREATE INDEX "SubscriptionInvoice_tenantId_paidAt_idx" ON "SubscriptionInvoice"("tenantId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionInvoice_tenantId_id_key" ON "SubscriptionInvoice"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_planCatalogId_fkey" FOREIGN KEY ("planCatalogId") REFERENCES "PlanCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_tenantId_subscriptionId_fkey" FOREIGN KEY ("tenantId", "subscriptionId") REFERENCES "Subscription"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_tenantId_subscriptionId_fkey" FOREIGN KEY ("tenantId", "subscriptionId") REFERENCES "Subscription"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
