CREATE OR REPLACE FUNCTION reject_stock_movement_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (
    SELECT 1 FROM "Tenant" WHERE "id" = OLD."tenantId"
  ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Stock movements are immutable; record a correcting movement instead';
END;
$$ LANGUAGE plpgsql;