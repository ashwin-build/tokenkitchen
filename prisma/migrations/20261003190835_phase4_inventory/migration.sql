-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'SPOILAGE';

-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "purchaseId" TEXT;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "createdByClerkUserId" TEXT,
ADD COLUMN     "purchaseId" TEXT;

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "totalPaise" INTEGER NOT NULL,
    "paidPaise" INTEGER NOT NULL DEFAULT 0,
    "paymentMode" "PaymentMode",
    "createdByClerkUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "ingredientName" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" "IngredientUnit" NOT NULL,
    "unitCostPaise" INTEGER NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Purchase_tenantId_supplierId_createdAt_idx" ON "Purchase"("tenantId", "supplierId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_tenantId_id_key" ON "Purchase"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_tenantId_idempotencyKey_key" ON "Purchase"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PurchaseItem_tenantId_purchaseId_idx" ON "PurchaseItem"("tenantId", "purchaseId");

-- CreateIndex
CREATE INDEX "PurchaseItem_tenantId_ingredientId_idx" ON "PurchaseItem"("tenantId", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseItem_tenantId_id_key" ON "PurchaseItem"("tenantId", "id");

-- CreateIndex
CREATE INDEX "LedgerEntry_tenantId_purchaseId_idx" ON "LedgerEntry"("tenantId", "purchaseId");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_purchaseId_idx" ON "StockMovement"("tenantId", "purchaseId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenantId_purchaseId_fkey" FOREIGN KEY ("tenantId", "purchaseId") REFERENCES "Purchase"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_tenantId_purchaseId_fkey" FOREIGN KEY ("tenantId", "purchaseId") REFERENCES "Purchase"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_tenantId_supplierId_fkey" FOREIGN KEY ("tenantId", "supplierId") REFERENCES "Party"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_tenantId_purchaseId_fkey" FOREIGN KEY ("tenantId", "purchaseId") REFERENCES "Purchase"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_tenantId_ingredientId_fkey" FOREIGN KEY ("tenantId", "ingredientId") REFERENCES "Ingredient"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
