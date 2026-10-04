/*
  Warnings:

  - The values [OPEN,ACCEPTED,REJECTED] on the enum `OrderStatus` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[tenantId,idempotencyKey]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `idempotencyKey` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "StockMode" AS ENUM ('ENFORCE', 'WARN');

-- CreateEnum
CREATE TYPE "SequenceCounterKind" AS ENUM ('TOKEN', 'INVOICE');

-- CreateEnum
CREATE TYPE "OrderAuditAction" AS ENUM ('CREATED', 'STATUS_CHANGED', 'CANCELLED');

-- Preserve legacy order statuses and assign stable idempotency keys to existing bills.
ALTER TABLE "Order" ADD COLUMN "idempotencyKey" TEXT;
UPDATE "Order" SET "idempotencyKey" = 'legacy-' || "id";
ALTER TABLE "Order" ALTER COLUMN "idempotencyKey" SET NOT NULL;

-- AlterEnum
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('PREPARING', 'READY', 'COMPLETED', 'CANCELLED');
ALTER TABLE "public"."Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING (
  CASE "status"::text
    WHEN 'OPEN' THEN 'PREPARING'
    WHEN 'ACCEPTED' THEN 'PREPARING'
    WHEN 'REJECTED' THEN 'CANCELLED'
    ELSE "status"::text
  END
)::"OrderStatus_new";
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "public"."OrderStatus_old";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PREPARING';
COMMIT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMPTZ(6),
ADD COLUMN     "cancelledByClerkUserId" TEXT,
ADD COLUMN     "roundOffPaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stockShortage" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "status" SET DEFAULT 'PREPARING';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "changePaise" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "pricesIncludeGst" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "stockMode" "StockMode" NOT NULL DEFAULT 'ENFORCE';

-- CreateTable
CREATE TABLE "SequenceCounter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "SequenceCounterKind" NOT NULL,
    "periodKey" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SequenceCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "actorClerkUserId" TEXT NOT NULL,
    "action" "OrderAuditAction" NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus",
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SequenceCounter_tenantId_idx" ON "SequenceCounter"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SequenceCounter_tenantId_kind_periodKey_key" ON "SequenceCounter"("tenantId", "kind", "periodKey");

-- CreateIndex
CREATE INDEX "OrderAuditEvent_tenantId_orderId_createdAt_idx" ON "OrderAuditEvent"("tenantId", "orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderAuditEvent_tenantId_id_key" ON "OrderAuditEvent"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantId_idempotencyKey_key" ON "Order"("tenantId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "SequenceCounter" ADD CONSTRAINT "SequenceCounter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAuditEvent" ADD CONSTRAINT "OrderAuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAuditEvent" ADD CONSTRAINT "OrderAuditEvent_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "Order"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE FUNCTION guard_stock_movement_for_tenant_mode() RETURNS trigger AS $$
DECLARE
  available_stock DECIMAL(12,3);
  tenant_stock_mode "StockMode";
BEGIN
  SELECT i."currentStock", t."stockMode"
  INTO available_stock, tenant_stock_mode
  FROM "Ingredient" i
  JOIN "Tenant" t ON t."id" = i."tenantId"
  WHERE i."tenantId" = NEW."tenantId" AND i."id" = NEW."ingredientId"
  FOR UPDATE OF i;

  IF tenant_stock_mode = 'ENFORCE' AND available_stock + NEW."quantityDelta" < 0 THEN
    RAISE EXCEPTION 'Insufficient stock for ingredient %', NEW."ingredientId";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StockMovement_tenant_mode_guard"
BEFORE INSERT ON "StockMovement"
FOR EACH ROW EXECUTE FUNCTION guard_stock_movement_for_tenant_mode();
