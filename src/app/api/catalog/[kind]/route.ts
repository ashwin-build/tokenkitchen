import { z } from "zod";
import { exportCatalogCsv } from "@/server/catalog/imports";
import { currentCatalogMembership } from "@/server/catalog/access";

const kindSchema = z.enum(["ingredients", "dishes"]);

export async function GET(_request: Request, context: RouteContext<"/api/catalog/[kind]">) {
  await currentCatalogMembership();
  const { kind: rawKind } = await context.params;
  const kind = kindSchema.safeParse(rawKind);
  if (!kind.success) return Response.json({ error: "Unknown catalog export." }, { status: 404 });
  return exportCatalogCsv(kind.data);
}