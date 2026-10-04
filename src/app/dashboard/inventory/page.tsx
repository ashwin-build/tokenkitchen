import { randomUUID } from "node:crypto";
import { InventoryClient } from "@/app/dashboard/inventory/inventory-client";
import { getInventoryPageData } from "@/server/inventory/queries";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const data = await getInventoryPageData();
  return <InventoryClient {...data} idempotencyKey={randomUUID()} />;
}