import { z } from "zod";
import { currentCatalogMembership } from "@/server/catalog/access";
import { templateCsv } from "@/server/catalog/imports";

const kindSchema = z.enum(["ingredients", "dishes"]);

export async function GET(_request: Request, context: RouteContext<"/api/catalog/[kind]/template">) {
  await currentCatalogMembership();
  const { kind: rawKind } = await context.params;
  const kind = kindSchema.safeParse(rawKind);
  if (!kind.success) return Response.json({ error: "Unknown catalog template." }, { status: 404 });
  return templateCsv(kind.data);
}