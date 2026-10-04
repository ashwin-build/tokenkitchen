export const MAX_CSV_BYTES = 512 * 1024;

export type CsvParseResult = {
  rows: string[][];
  errors: string[];
};

export function parseCsv(source: string, maxBytes = MAX_CSV_BYTES): CsvParseResult {
  if (new TextEncoder().encode(source).byteLength > maxBytes) {
    return { rows: [], errors: [`CSV exceeds the ${Math.floor(maxBytes / 1024)} KB size limit.`] };
  }

  const text = source.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  const errors: string[] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let quoteClosed = false;
  let rowNumber = 1;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          quoteClosed = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (quoteClosed && character !== "," && character !== "\r" && character !== "\n") {
      errors.push(`Row ${rowNumber}: unexpected text after a closing quote.`);
      quoteClosed = false;
      field += character;
      continue;
    }

    if (character === '"') {
      if (field.length > 0) {
        errors.push(`Row ${rowNumber}: quote inside an unquoted field.`);
      } else {
        inQuotes = true;
      }
    } else if (character === ",") {
      row.push(field);
      field = "";
      quoteClosed = false;
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
      quoteClosed = false;
      rowNumber += 1;
    } else {
      field += character;
    }
  }

  if (inQuotes) {
    errors.push(`Row ${rowNumber}: unclosed quoted field.`);
  }

  if (field.length > 0 || row.length > 0 || quoteClosed) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  }

  return { rows, errors };
}

export function escapeCsvCell(value: unknown): string {
  let cell = String(value ?? "");
  if (/^[=+\-@]/.test(cell)) {
    cell = `'${cell}`;
  }
  return `"${cell.replaceAll('"', '""')}"`;
}

export function serializeCsv(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [headers, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n") + "\r\n";
}

export function csvResponse(filename: string, content: string): Response {
  return new Response(`\uFEFF${content}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}