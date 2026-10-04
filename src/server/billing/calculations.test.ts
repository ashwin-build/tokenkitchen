import { describe, expect, it } from "vitest";
import { allocatePayments, calculateBillLine, calculateInvoiceTotals } from "@/server/billing/calculations";
import { getBusinessDate, getCalendarDate, getFinancialYear } from "@/server/billing/business-time";

describe.each([0, 5, 12, 18])("GST %i percent", (gstRate) => {
  it("calculates inclusive tax per line in paise", () => {
    const line = calculateBillLine({
      dishId: "dish-1",
      dishName: "Meal",
      unit: "portion",
      unitPricePaise: 10000,
      gstRate,
      quantity: "1",
    }, true);

    const expectedTax = Math.round(10000 * gstRate / (100 + gstRate));
    expect(line.cgstPaise + line.sgstPaise).toBe(expectedTax);
    expect(line.taxableAmountPaise + line.cgstPaise + line.sgstPaise).toBe(10000);
    expect(calculateInvoiceTotals([line]).totalPaise).toBe(10000);
  });

  it("calculates exclusive tax per line in paise", () => {
    const line = calculateBillLine({
      dishId: "dish-1",
      dishName: "Meal",
      unit: "portion",
      unitPricePaise: 10000,
      gstRate,
      quantity: "1",
    }, false);

    const expectedTax = Math.round(10000 * gstRate / 100);
    expect(line.taxableAmountPaise).toBe(10000);
    expect(line.cgstPaise + line.sgstPaise).toBe(expectedTax);
    expect(line.totalPaise).toBe(10000 + expectedTax);
  });
});

describe("invoice rounding and split payments", () => {
  it("rounds only the summed invoice total to the nearest rupee", () => {
    const lines = [
      calculateBillLine({ dishId: "a", dishName: "A", unit: "portion", unitPricePaise: 101, gstRate: 0, quantity: "1" }, false),
      calculateBillLine({ dishId: "b", dishName: "B", unit: "portion", unitPricePaise: 101, gstRate: 0, quantity: "1" }, false),
    ];
    expect(calculateInvoiceTotals(lines)).toMatchObject({ subtotalPaise: 202, totalPaise: 200, roundOffPaise: -2 });
  });

  it("allocates split payments, customer balance, and cash change", () => {
    expect(allocatePayments([
      { mode: "CASH", amountPaise: 5000 },
      { mode: "UPI", amountPaise: 2500 },
    ], 10000, true)).toMatchObject({ paidPaise: 7500, balancePaise: 2500 });

    expect(allocatePayments([{ mode: "CASH", amountPaise: 12000 }], 10000, false))
      .toMatchObject({ paidPaise: 10000, balancePaise: 0, changePaise: 2000, payments: [{ changePaise: 2000 }] });

    expect(() => allocatePayments([{ mode: "UPI", amountPaise: 12000 }], 10000, false)).toThrow(/cash covers the change/);
    expect(() => allocatePayments([], 10000, false)).toThrow(/Choose a customer/);
  });
});

describe("business day and financial year", () => {
  it.each([
    ["2026-10-03T22:29:00.000Z", "2026-10-03"],
    ["2026-10-03T22:30:00.000Z", "2026-10-04"],
    ["2026-04-01T22:29:00.000Z", "2026-04-01"],
  ])("uses the configured 4:00 AM Asia/Kolkata cutoff", (utcTime, expected) => {
    expect(getBusinessDate(new Date(utcTime), "Asia/Kolkata", 240)).toBe(expected);
  });

  it("uses April-to-March financial years", () => {
    expect(getFinancialYear("2026-03-31")).toEqual({ key: "2025-2026", shortKey: "2025-26" });
    expect(getFinancialYear("2026-04-01")).toEqual({ key: "2026-2027", shortKey: "2026-27" });
  });

  it("uses the actual local date for invoice FY even before the token cutoff", () => {
    const instant = new Date("2026-03-31T22:29:00.000Z");
    expect(getBusinessDate(instant, "Asia/Kolkata", 240)).toBe("2026-03-31");
    expect(getCalendarDate(instant, "Asia/Kolkata")).toBe("2026-04-01");
    expect(getFinancialYear(getCalendarDate(instant, "Asia/Kolkata")).key).toBe("2026-2027");
  });
});