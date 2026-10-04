CREATE FUNCTION guard_ingredient_initial_stock() RETURNS trigger AS $$
BEGIN
  IF NEW."currentStock" <> 0
     AND current_setting('tokenkitchen.stock_movement_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Opening stock must be recorded by inserting a stock movement';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Ingredient_initial_stock_guard"
BEFORE INSERT ON "Ingredient"
FOR EACH ROW EXECUTE FUNCTION guard_ingredient_initial_stock();