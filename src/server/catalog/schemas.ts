import { z } from "zod";

export const ingredientUnits = ["kg", "g", "L", "ml", "pcs"] as const;
export const gstRates = [0, 5, 12, 18] as const;

const quantityPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/;
const moneyPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

export const quantitySchema = z.string()
  .trim()
  .regex(quantityPattern, "Enter a non-negative quantity with up to 3 decimal places.")
  .refine((value) => quantityToMilliUnits(value) <= BigInt("999999999999"), "Quantity exceeds the supported range.");
export const rupeesSchema = z.string()
  .trim()
  .regex(moneyPattern, "Enter a non-negative amount with up to 2 decimal places.")
  .refine((value) => {
    const [rupees, fraction = ""] = value.split(".");
    return BigInt(rupees) * BigInt(100) + BigInt(fraction.padEnd(2, "0")) <= BigInt(2147483647);
  }, "The price exceeds the supported paise range.");
export const paiseSchema = z.string().trim().regex(/^(?:0|[1-9]\d*)$/, "Enter a non-negative whole amount in paise.")
  .transform(Number)
  .refine((value) => Number.isSafeInteger(value) && value <= 2147483647, "The amount exceeds the supported paise range.");

const optionalQuantitySchema = z.union([z.literal(""), quantitySchema]).transform((value) => value === "" ? null : value);
const optionalIdSchema = z.union([z.literal(""), z.string().cuid()]).transform((value) => value || undefined);

export const ingredientFormSchema = z.object({
  id: optionalIdSchema,
  name: z.string().trim().min(1, "Enter an ingredient name.").max(80),
  unit: z.enum(ingredientUnits),
  openingQuantity: quantitySchema,
  reorderLevel: optionalQuantitySchema,
  costPerUnitPaise: paiseSchema,
  isActive: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
});

export const recipeLineSchema = z.object({
  ingredientId: z.string().cuid(),
  quantityPerDish: quantitySchema.refine((value) => Number(value) > 0, "Recipe quantities must be greater than zero."),
});

export const dishFormSchema = z.object({
  id: optionalIdSchema,
  name: z.string().trim().min(1, "Enter a dish name.").max(80),
  priceRupees: rupeesSchema,
  gstRate: z.coerce.number().int().refine((value): value is (typeof gstRates)[number] => gstRates.includes(value as (typeof gstRates)[number]), "Choose GST 0%, 5%, 12%, or 18%."),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
  recipeLines: z.string().transform((source, context) => {
    try {
      const parsed = z.array(recipeLineSchema).max(100).safeParse(JSON.parse(source));
      if (!parsed.success) {
        context.addIssue({ code: "custom", message: "Check the recipe ingredients and quantities." });
        return z.NEVER;
      }
      return parsed.data;
    } catch {
      context.addIssue({ code: "custom", message: "The recipe could not be read." });
      return z.NEVER;
    }
  }),
}).transform(({ priceRupees, ...dish }) => ({
  ...dish,
  pricePaise: rupeesToPaise(priceRupees),
}));

export function rupeesToPaise(value: string): number {
  const [rupees, fraction = ""] = value.split(".");
  const paise = BigInt(rupees) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  if (paise > BigInt(2147483647)) {
    throw new Error("The amount is too large.");
  }
  return Number(paise);
}

export function quantityToMilliUnits(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(1000) + BigInt(fraction.padEnd(3, "0"));
}

export const ingredientCsvHeaders = [
  "name",
  "unit",
  "currentQuantity",
  "reorderLevel",
  "costPerUnitPaise",
  "active",
] as const;

export const dishCsvHeaders = [
  "name",
  "pricePaise",
  "gstRate",
  "active",
  "recipe",
] as const;

export const ingredientCsvRowSchema = z.object({
  name: z.string().trim().min(1).max(80),
  unit: z.enum(ingredientUnits),
  currentQuantity: quantitySchema,
  reorderLevel: optionalQuantitySchema,
  costPerUnitPaise: paiseSchema,
  active: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export const dishCsvRowSchema = z.object({
  name: z.string().trim().min(1).max(80),
  pricePaise: paiseSchema,
  gstRate: z.coerce.number().int().refine((value): value is (typeof gstRates)[number] => gstRates.includes(value as (typeof gstRates)[number]), "GST rate must be 0, 5, 12, or 18."),
  active: z.enum(["true", "false"]).transform((value) => value === "true"),
  recipe: z.string().trim(),
});