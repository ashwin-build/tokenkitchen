"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentCatalogMembership } from "@/server/catalog/access";
import { assertCatalogEditor } from "@/server/catalog/permissions";
import { CatalogImportError, confirmCatalogImport, previewCatalogImport, type CatalogImportPreview } from "@/server/catalog/imports";
import { MAX_CSV_BYTES } from "@/server/catalog/csv";

export type CatalogImportActionState = {
  status: "idle" | "preview" | "success" | "error";
  message: string;
  preview: CatalogImportPreview | null;
};

export const initialCatalogImportState: CatalogImportActionState = {
  status: "idle",
  message: "",
  preview: null,
};

const importRequestSchema = z.object({
  kind: z.enum(["ingredients", "dishes"]),
  csv: z.string().min(1, "Choose a CSV file or paste CSV content.").max(MAX_CSV_BYTES, "CSV exceeds the 512 KB size limit."),
});

function parseImportRequest(formData: FormData) {
  return importRequestSchema.safeParse({
    kind: formData.get("kind"),
    csv: formData.get("csv"),
  });
}

function actionError(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Check the CSV and try again.";
  if (error instanceof Error && !error.name.startsWith("Prisma")) return error.message;
  return "We could not process that CSV. Check the file and try again.";
}

export async function previewCatalogImportAction(
  _state: CatalogImportActionState,
  formData: FormData,
): Promise<CatalogImportActionState> {
  const membership = await currentCatalogMembership();
  try {
    assertCatalogEditor(membership);
    const request = parseImportRequest(formData);
    if (!request.success) return { status: "error", message: request.error.issues[0]?.message ?? "Check the CSV.", preview: null };
    const preview = await previewCatalogImport(membership, request.data.kind, request.data.csv);
    const hasErrors = preview.errors.length > 0 || preview.rows.some((row) => row.errors.length > 0);
    return {
      status: "preview",
      message: hasErrors ? "Fix the row errors before confirming this import." : "Review the changes, then confirm the import.",
      preview,
    };
  } catch (error) {
    return { status: "error", message: actionError(error), preview: null };
  }
}

export async function confirmCatalogImportAction(
  _state: CatalogImportActionState,
  formData: FormData,
): Promise<CatalogImportActionState> {
  const membership = await currentCatalogMembership();
  try {
    assertCatalogEditor(membership);
    const request = parseImportRequest(formData);
    if (!request.success) return { status: "error", message: request.error.issues[0]?.message ?? "Check the CSV.", preview: null };
    const preview = await confirmCatalogImport(membership, request.data.kind, request.data.csv);
    const route = request.data.kind === "ingredients" ? "/dashboard/ingredients" : "/dashboard/dishes";
    revalidatePath(route);
    revalidatePath(request.data.kind === "ingredients" ? "/dashboard/dishes" : "/dashboard/ingredients");
    return { status: "success", message: "CSV import completed.", preview };
  } catch (error) {
    if (error instanceof CatalogImportError) {
      return { status: "error", message: actionError(error), preview: error.preview };
    }
    return { status: "error", message: actionError(error), preview: null };
  }
}