import type { CatalogImportPreview } from "@/server/catalog/imports";

export type CatalogActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialCatalogActionState: CatalogActionState = {
  status: "idle",
  message: "",
};

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
