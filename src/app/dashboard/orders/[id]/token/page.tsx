import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { z } from "zod";
import { PrintButton } from "@/app/dashboard/orders/print-button";
import { getOrderPrintData } from "@/server/billing/queries";

export const dynamic = "force-dynamic";

const widthSchema = z.enum(["58", "80"]).catch("58");

export default async function TokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ width?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const data = await getOrderPrintData(id);
  if (!data) notFound();
  const width = widthSchema.parse(query.width);
  const style = { "--receipt-width": `${width}mm` } as CSSProperties;

  return (
    <article className="thermal-slip mx-auto mt-5 bg-white p-4 text-center text-sm text-black" data-print-document style={style}>
      <style>{`@page { size: ${width}mm auto; margin: 2mm; }`}</style>
      <div className="no-print mb-4 flex flex-wrap justify-center gap-2">
        <Link className="tk-button-secondary" href={`/dashboard/orders/${data.order.id}/token?width=58`}>58 mm</Link>
        <Link className="tk-button-secondary" href={`/dashboard/orders/${data.order.id}/token?width=80`}>80 mm</Link>
        <PrintButton>Print token</PrintButton>
      </div>
      <p className="font-semibold">{data.tenant.name}</p>
      <p className="mt-1 text-xs">{data.order.invoiceNo}</p>
      <p className="mt-4 text-xs uppercase tracking-[0.12em]">Token</p>
      <p className="my-1 text-5xl font-bold leading-none">{data.order.tokenNo}</p>
      <p className="mt-2 border-b border-dashed border-black pb-3 text-xs">{new Date(data.order.createdAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} · {data.order.status}</p>
      <ul className="divide-y divide-dashed divide-black text-left">
        {data.order.items.map((item, index) => <li className="flex justify-between gap-2 py-2" key={`${item.dishName}-${index}`}><span>{item.dishName}</span><strong>{item.quantity}</strong></li>)}
      </ul>
      <p className="mt-3 border-t border-dashed border-black pt-3 text-left text-xs">Total <strong className="float-right">₹{(data.order.totalPaise / 100).toFixed(2)}</strong></p>
      <div className="no-print mt-4 flex justify-center"><Link className="tk-button-secondary" href={`/dashboard/orders/${data.order.id}/invoice`}>Invoice</Link></div>
    </article>
  );
}