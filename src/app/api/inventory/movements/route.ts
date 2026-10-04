import { stockMovementCsv } from "@/server/inventory/queries";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return stockMovementCsv({
    ingredientId: url.searchParams.get("ingredientId") ?? "",
    type: url.searchParams.get("type") ?? "",
    from: url.searchParams.get("from") ?? "",
    to: url.searchParams.get("to") ?? "",
  });
}