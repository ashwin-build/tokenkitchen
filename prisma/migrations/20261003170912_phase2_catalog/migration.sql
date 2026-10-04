/*
  Warnings:

  - You are about to alter the column `gstRate` on the `Dish` table. The data in that column could be lost. The data in that column will be cast from `Decimal(5,2)` to `Integer`.
  - You are about to drop the column `lowStockThreshold` on the `Ingredient` table. All the data in the column will be lost.
  - Made the column `unitCostPaise` on table `Ingredient` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'OPENING';

-- DropIndex
DROP INDEX "Dish_tenantId_name_key";

-- DropIndex
DROP INDEX "Ingredient_tenantId_name_key";

-- AlterTable
ALTER TABLE "Dish" ALTER COLUMN "gstRate" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "Ingredient" DROP COLUMN "lowStockThreshold",
ADD COLUMN     "reorderLevel" DECIMAL(12,3),
ALTER COLUMN "unitCostPaise" SET NOT NULL,
ALTER COLUMN "unitCostPaise" SET DEFAULT 0;

-- CreateIndex
CREATE INDEX "Dish_tenantId_name_idx" ON "Dish"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Ingredient_tenantId_name_idx" ON "Ingredient"("tenantId", "name");

-- Enforce case-insensitive uniqueness without relying on application collation.
CREATE UNIQUE INDEX "Ingredient_tenantId_lower_name_key"
ON "Ingredient" ("tenantId", lower("name"));

CREATE UNIQUE INDEX "Dish_tenantId_lower_name_key"
ON "Dish" ("tenantId", lower("name"));

-- Stock is derived from the immutable movement ledger; only its trigger may update the balance.
CREATE FUNCTION guard_ingredient_stock_update() RETURNS trigger AS $$
BEGIN
  IF NEW."currentStock" IS DISTINCT FROM OLD."currentStock"
     AND current_setting('tokenkitchen.stock_movement_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Ingredient stock can only be changed by inserting a stock movement';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Ingredient_stock_update_guard"
BEFORE UPDATE OF "currentStock" ON "Ingredient"
FOR EACH ROW EXECUTE FUNCTION guard_ingredient_stock_update();

CREATE FUNCTION apply_stock_movement() RETURNS trigger AS $$
DECLARE
  previous_guard text;
BEGIN
  previous_guard := current_setting('tokenkitchen.stock_movement_write', true);
  PERFORM set_config('tokenkitchen.stock_movement_write', 'on', true);

  UPDATE "Ingredient"
  SET "currentStock" = "currentStock" + NEW."quantityDelta",
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "tenantId" = NEW."tenantId" AND "id" = NEW."ingredientId";

  PERFORM set_config('tokenkitchen.stock_movement_write', COALESCE(previous_guard, ''), true);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('tokenkitchen.stock_movement_write', COALESCE(previous_guard, ''), true);
  RAISE;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StockMovement_apply_to_ingredient"
AFTER INSERT ON "StockMovement"
FOR EACH ROW EXECUTE FUNCTION apply_stock_movement();
