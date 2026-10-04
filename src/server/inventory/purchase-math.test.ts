import { describe, expect, it } from "vitest";
import { calculatePurchaseLinePaise, calculatePurchaseTotals } from "@/server/inventory/purchase-math";

describe("purchase paise maths", () => {
  it.each([
    ["1", 45000, 45000],
    ["1.25", 45000, 56250],
    ["0.001", 199, 0],
    ["0.003", 199, 1],
    ["0.005", 199, 1],
  ])("rounds %s units at %i paise per unit to %i paise", (quantity, unitCostPaise, expected) => {
    expect(calculatePurchaseLinePaise({ quantity, unitCostPaise })).toBe(expected);
  });

  it("sums purchase lines and derives paid and supplier balance", () => {
    expect(calculatePurchaseTotals([
      { quantity: "2.5", unitCostPaise: 8000 },
      { quantity: "1", unitCostPaise: 12000 },
    ], 15000)).toEqual({
      lineAmountsPaise: [20000, 12000],
      totalPaise: 32000,
      paidNowPaise: 15000,
      balancePaise: 17000,
    });
  });

  it("rejects payment beyond the purchase total", () => {
    expect(() => calculatePurchaseTotals([{ quantity: "1", unitCostPaise: 100 }], 101)).toThrow(/between zero and the purchase total/);
  });
});