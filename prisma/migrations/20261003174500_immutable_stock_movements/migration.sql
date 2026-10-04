CREATE FUNCTION reject_stock_movement_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Stock movements are immutable; record a correcting movement instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StockMovement_immutable"
BEFORE UPDATE OR DELETE ON "StockMovement"
FOR EACH ROW EXECUTE FUNCTION reject_stock_movement_mutation();