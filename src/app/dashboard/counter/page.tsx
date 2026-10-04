import { randomUUID } from "node:crypto";
import { CounterClient } from "@/app/dashboard/counter-client";
import { getCounterData } from "@/server/billing/queries";

export const dynamic = "force-dynamic";

export default async function CounterPage() {
  const data = await getCounterData();
  return <CounterClient
    dishes={data.dishes}
    customers={data.customers}
    pricesIncludeGst={data.tenant.pricesIncludeGst}
    stockMode={data.tenant.stockMode}
    idempotencyKey={randomUUID()}
  />;
}