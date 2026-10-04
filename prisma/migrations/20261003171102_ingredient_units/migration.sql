/*
  Warnings:

  - Changed the type of `unit` on the `Ingredient` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `unit` on the `RecipeLine` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "IngredientUnit" AS ENUM ('kg', 'g', 'L', 'ml', 'pcs');

-- Preserve existing values while constraining them to supported units.
ALTER TABLE "Ingredient"
ALTER COLUMN "unit" TYPE "IngredientUnit" USING "unit"::text::"IngredientUnit";

ALTER TABLE "RecipeLine"
ALTER COLUMN "unit" TYPE "IngredientUnit" USING "unit"::text::"IngredientUnit";
