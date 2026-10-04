import { describe, expect, it } from "vitest";
import { calculateSubscriptionTax } from "@/server/billing/subscription-tax";

describe("subscription GST invoice maths", () => {
  it("extracts inclusive GST and splits it evenly", () => {
    expect(calculateSubscriptionTax(69900, true, 18)).toEqual({
      taxableAmountPaise: 59237,
      gstAmountPaise: 10663,
      cgstPaise: 5331,
      sgstPaise: 5332,
      totalPaise: 69900,
    });
  });

  it("adds exclusive GST to the plan price", () => {
    expect(calculateSubscriptionTax(10000, false, 18)).toEqual({
      taxableAmountPaise: 10000,
      gstAmountPaise: 1800,
      cgstPaise: 900,
      sgstPaise: 900,
      totalPaise: 11800,
    });
  });
});