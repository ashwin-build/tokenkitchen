import {
  dishCsvHeaders,
  dishCsvRowSchema,
  ingredientCsvHeaders,
  ingredientCsvRowSchema,
  quantitySchema,
} from "@/server/catalog/schemas";
import { parseCsv } from "@/server/catalog/csv";

export type CatalogImportKind = "ingredients" | "dishes";

export type ParsedIngredientImport = {
  name: string;
  unit: "kg" | "g" | "L" | "ml" | "pcs";
  currentQuantity: string;
  reorderLevel: string | null;
  costPerUnitPaise: number;
  active: boolean;
};

export type ParsedDishImport = {
  name: string;
  pricePaise: number;
  gstRate: 0 | 5 | 12 | 18;
  active: boolean;
  recipe: { ingredientName: string; quantityPerDish: string }[];
};

export type ParsedImportRow<T> = {
  rowNumber: number;
  name: string;
  data?: T;
  errors: string[];
};

export type ParsedImport<T> = {
  rows: ParsedImportRow<T>[];
  errors: string[];
};

function restoreFormulaPrefixedValue(value: string): string {
  return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
}

function readTable(source: string, headers: readonly string[]) {
  const parsed = parseCsv(source);
  if (parsed.errors.length > 0) return { records: [] as string[][], errors: parsed.errors };
  if (parsed.rows.length === 0) return { records: [] as string[][], errors: ["CSV is empty."] };

  const receivedHeaders = parsed.rows[0].map((header) => header.trim());
  if (receivedHeaders.length !== headers.length || headers.some((header, index) => receivedHeaders[index] !== header)) {
    return {
      records: [] as string[][],
      errors: [`CSV columns must be: ${headers.join(", " )}.`],
    };
  }

  return { records: parsed.rows.slice(1), errors: [] };
}

function parseRows<T>(source: string, headers: readonly string[], validate: (cells: Record<string, string>) => T): ParsedImport<T> {
  const table = readTable(source, headers);
  if (table.errors.length > 0) return { rows: [], errors: table.errors };

  const rows: ParsedImportRow<T>[] = [];
  table.records.forEach((values, index) => {
    const rowNumber = index + 2;
    const cells = Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ""])) as Record<string, string>;
    const name = restoreFormulaPrefixedValue(cells.name ?? "").trim();
    const errors: string[] = [];

    if (values.length !== headers.length) {
      errors.push(`Row must contain exactly ${headers.length} columns.`);
    }
    try {
      const data = validate({ ...cells, name });
      rows.push({ rowNumber, name, data: errors.length === 0 ? data : undefined, errors });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Check this row's values.");
      rows.push({ rowNumber, name, errors });
    }
  });

  return { rows, errors: [] };
}

export function parseIngredientImport(source: string): ParsedImport<ParsedIngredientImport> {
  return parseRows(source, ingredientCsvHeaders, (cells) => {
    const parsed = ingredientCsvRowSchema.safeParse(cells);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check this row's values.");
    return parsed.data;
  });
}

function parseRecipe(value: string): ParsedDishImport["recipe"] {
  if (!value.trim()) return [];

  return value.split("|").map((part) => {
    const separator = part.lastIndexOf(":");
    if (separator < 1) throw new Error("Recipe entries must use ingredient:amount|ingredient:amount.");
    const ingredientName = restoreFormulaPrefixedValue(part.slice(0, separator).trim());
    const quantity = quantitySchema.safeParse(part.slice(separator + 1).trim());
    if (!ingredientName || !quantity.success || Number(quantity.data) <= 0) {
      throw new Error("Recipe entries need an ingredient name and a positive quantity.");
    }
    return { ingredientName, quantityPerDish: quantity.data };
  });
}

export function parseDishImport(source: string): ParsedImport<ParsedDishImport> {
  return parseRows(source, dishCsvHeaders, (cells) => {
    const parsed = dishCsvRowSchema.safeParse({ ...cells, name: restoreFormulaPrefixedValue(cells.name ?? "").trim() });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check this row's values.");
    return { ...parsed.data, recipe: parseRecipe(parsed.data.recipe) };
  });
}

export function csvHeadersFor(kind: CatalogImportKind) {
  return kind === "ingredients" ? ingredientCsvHeaders : dishCsvHeaders;
}