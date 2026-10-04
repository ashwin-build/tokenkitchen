import { quantityToMilliUnits } from "@/server/catalog/schemas";

export type PurchaseLineInput = {
  quantity: string;
  unitCostPaise: number;
};

export class PurchaseMathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseMathError";
  }
}

export function calculatePurchaseLinePaise(line: PurchaseLineInput): number {
  if (!Number.isSafeInteger(line.unitCostPaise) || line.unitCostPaise < 0) {
    throw new PurchaseMathError("Unit cost must be a non-negative whole paise amount.");
  }
  const quantityMilli = quantityToMilliUnits(line.quantity);
  if (quantityMilli <= BigInt(0)) throw new PurchaseMathError("Purchase quantity must be greater than zero.");

  const amountPaise = (BigInt(line.unitCostPaise) * quantityMilli + BigInt(500)) / BigInt(1000);
  if (amountPaise > BigInt(2147483647)) throw new PurchaseMathError("Purchase line exceeds the supported paise range.");
  return Number(amountPaise);
}

export function calculatePurchaseTotals(lines: PurchaseLineInput[], paidNowPaise: number) {
  const lineAmountsPaise = lines.map(calculatePurchaseLinePaise);
  const totalPaise = lineAmountsPaise.reduce((total, amount) => total + amount, 0);
  if (!Number.isSafeInteger(totalPaise) || totalPaise > 2147483647) {
    throw new PurchaseMathError("Purchase exceeds the supported paise range.");
  }
  if (!Number.isSafeInteger(paidNowPaise) || paidNowPaise < 0 || paidNowPaise > totalPaise) {
    throw new PurchaseMathError("Amount paid now must be between zero and the purchase total.");
  }
  return { lineAmountsPaise, totalPaise, paidNowPaise, balancePaise: totalPaise - paidNowPaise };
}