import { quantityToMilliUnits } from "@/server/catalog/schemas";

export type RecipeCostLine = {
  quantityPerDish: string;
  unitCostPaise: number;
};

export function calculateRecipeCostPaise(lines: RecipeCostLine[]): number {
  const total = lines.reduce((cost, line) => {
    const lineCost = (
      BigInt(line.unitCostPaise) * quantityToMilliUnits(line.quantityPerDish) + BigInt(500)
    ) / BigInt(1000);
    return cost + lineCost;
  }, BigInt(0));

  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("The recipe cost is too large.");
  }

  return Number(total);
}