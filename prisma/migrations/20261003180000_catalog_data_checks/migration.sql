UPDATE "Ingredient" SET "unitCostPaise" = 0 WHERE "unitCostPaise" IS NULL;

ALTER TABLE "Ingredient"
ADD CONSTRAINT "Ingredient_name_nonblank" CHECK (length(btrim("name")) > 0),
ADD CONSTRAINT "Ingredient_stock_nonnegative" CHECK ("currentStock" >= 0),
ADD CONSTRAINT "Ingredient_reorder_nonnegative" CHECK ("reorderLevel" IS NULL OR "reorderLevel" >= 0),
ADD CONSTRAINT "Ingredient_cost_nonnegative" CHECK ("unitCostPaise" >= 0);

ALTER TABLE "Dish"
ADD CONSTRAINT "Dish_name_nonblank" CHECK (length(btrim("name")) > 0),
ADD CONSTRAINT "Dish_price_nonnegative" CHECK ("pricePaise" >= 0),
ADD CONSTRAINT "Dish_gst_rate_allowed" CHECK ("gstRate" IN (0, 5, 12, 18));

ALTER TABLE "RecipeLine"
ADD CONSTRAINT "RecipeLine_quantity_positive" CHECK ("quantityPerDish" > 0);