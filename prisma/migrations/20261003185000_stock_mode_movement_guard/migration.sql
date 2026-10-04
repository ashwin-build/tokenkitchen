-- Stock mode is checked while locking the ingredient row before its balance trigger runs.
ALTER TABLE "Ingredient" DROP CONSTRAINT IF EXISTS "Ingredient_stock_nonnegative";

CREATE OR REPLACE FUNCTION guard_stock_movement_for_tenant_mode() RETURNS trigger AS $$
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

DROP TRIGGER IF EXISTS "StockMovement_tenant_mode_guard" ON "StockMovement";
CREATE TRIGGER "StockMovement_tenant_mode_guard"
BEFORE INSERT ON "StockMovement"
FOR EACH ROW EXECUTE FUNCTION guard_stock_movement_for_tenant_mode();