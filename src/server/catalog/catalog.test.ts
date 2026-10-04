import { describe, expect, it } from "vitest";
import { parseCsv, serializeCsv } from "@/server/catalog/csv";
import { calculateRecipeCostPaise } from "@/server/catalog/math";
import { dishFormSchema, ingredientFormSchema } from "@/server/catalog/schemas";
import { parseDishImport, parseIngredientImport } from "@/server/catalog/import-format";

describe("CSV parsing and export", () => {
  it("parses commas, escaped quotes, and newlines inside quoted fields", () => {
    expect(parseCsv('name,notes\r\n"Rice, aged","said ""hello""\nthere"')).toEqual({
      rows: [["name", "notes"], ["Rice, aged", 'said "hello"\nthere']],
      errors: [],
    });
  });

  it("escapes CSV cells and prefixes spreadsheet formula characters", () => {
    expect(serializeCsv(["name", "note"], [["=1+1", 'He said "yes", ok']])).toBe(
      '"name","note"\r\n"\'=1+1","He said ""yes"", ok"\r\n',
    );
    for (const value of ["+cmd", "-cmd", "@SUM(A1)"]) {
      expect(serializeCsv(["value"], [[value]])).toContain(`"'${value}"`);
    }
  });

  it("rejects malformed and over-limit CSV", () => {
    expect(parseCsv('a,b\n"unfinished').errors).toContain("Row 2: unclosed quoted field.");
    expect(parseCsv("name\nvalue", 4).errors[0]).toMatch(/size limit/);
  });
});

describe("catalog calculations and validation", () => {
  it("calculates per-serving food cost with paise rounding", () => {
    expect(calculateRecipeCostPaise([
      { quantityPerDish: "0.125", unitCostPaise: 12000 },
      { quantityPerDish: "2", unitCostPaise: 75 },
    ])).toBe(1650);
  });

  it("validates catalog forms and rupee-to-paise conversion", () => {
    expect(ingredientFormSchema.safeParse({
      id: "",
      name: "  Tomatoes ",
      unit: "kg",
      openingQuantity: "2.500",
      reorderLevel: "1",
      costPerUnitPaise: "25000",
    }).success).toBe(true);

    expect(ingredientFormSchema.safeParse({
      id: "",
      name: "Tomatoes",
      unit: "gallon",
      openingQuantity: "-1",
      reorderLevel: "",
      costPerUnitPaise: "20",
    }).success).toBe(false);

    expect(dishFormSchema.parse({
      id: "",
      name: "Masala dosa",
      priceRupees: "129.50",
      gstRate: "5",
      isActive: "true",
      recipeLines: "[]",
    }).pricePaise).toBe(12950);

    expect(dishFormSchema.safeParse({
      id: "",
      name: "Invalid GST",
      priceRupees: "10.00",
      gstRate: "7",
      isActive: "true",
      recipeLines: "[]",
    }).success).toBe(false);

    expect(dishFormSchema.safeParse({
      id: "",
      name: "Price too large",
      priceRupees: "21474836.48",
      gstRate: "5",
      isActive: "true",
      recipeLines: "[]",
    }).success).toBe(false);
  });

  it("parses import recipes and reports malformed rows instead of dropping them", () => {
    const parsed = parseDishImport(
      'name,pricePaise,gstRate,active,recipe\n"Combo, meal",25000,5,true,"Rice:0.125|Oil:0.020"',
    );
    expect(parsed.rows[0]?.data?.recipe).toEqual([
      { ingredientName: "Rice", quantityPerDish: "0.125" },
      { ingredientName: "Oil", quantityPerDish: "0.020" },
    ]);

    const malformed = parseDishImport("name,pricePaise,gstRate,active,recipe\nDish,100,5,true,Rice");
    expect(malformed.rows[0]?.errors).toContain("Recipe entries must use ingredient:amount|ingredient:amount.");
  });

  it("round-trips formula-protected names through an import", () => {
    const exported = serializeCsv(
      ["name", "unit", "currentQuantity", "reorderLevel", "costPerUnitPaise", "active"],
      [["=unsafe", "kg", "0", "", "0", "true"]],
    );
    expect(parseIngredientImport(exported).rows[0]?.data?.name).toBe("=unsafe");
  });
});