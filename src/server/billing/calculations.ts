import { quantityToMilliUnits } from "@/server/catalog/schemas";

export type BillDishLineInput = {
  dishId: string;
  dishName: string;
  unit: string;
  unitPricePaise: number;
  gstRate: number;
  quantity: string;
};

export type CalculatedBillLine = BillDishLineInput & {
  taxableAmountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  totalPaise: number;
};

export type PaymentInput = {
  mode: "CASH" | "UPI" | "CARD" | "BANK";
  amountPaise: number;
};

export type CalculatedPayment = PaymentInput & { changePaise: number };

export class BillCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillCalculationError";
  }
}

function roundedRatio(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / BigInt(2)) / denominator;
}

function toSafePaise(value: bigint): number {
  if (value < BigInt(0) || value > BigInt(2147483647)) {
    throw new BillCalculationError("This bill exceeds the supported paise range.");
  }
  return Number(value);
}

export function calculateBillLine(line: BillDishLineInput, pricesIncludeGst: boolean): CalculatedBillLine {
  if (![0, 5, 12, 18].includes(line.gstRate)) {
    throw new BillCalculationError(`GST rate for ${line.dishName} is not supported.`);
  }

  const quantityMilli = quantityToMilliUnits(line.quantity);
  const grossOrTaxablePaise = roundedRatio(
    BigInt(line.unitPricePaise) * quantityMilli,
    BigInt(1000),
  );
  const gstTotalPaise = pricesIncludeGst
    ? roundedRatio(grossOrTaxablePaise * BigInt(line.gstRate), BigInt(100 + line.gstRate))
    : roundedRatio(grossOrTaxablePaise * BigInt(line.gstRate), BigInt(100));
  const taxablePaise = pricesIncludeGst ? grossOrTaxablePaise - gstTotalPaise : grossOrTaxablePaise;
  const cgstPaise = gstTotalPaise / BigInt(2);
  const sgstPaise = gstTotalPaise - cgstPaise;
  const totalPaise = pricesIncludeGst ? grossOrTaxablePaise : grossOrTaxablePaise + gstTotalPaise;

  return {
    ...line,
    taxableAmountPaise: toSafePaise(taxablePaise),
    cgstPaise: toSafePaise(cgstPaise),
    sgstPaise: toSafePaise(sgstPaise),
    totalPaise: toSafePaise(totalPaise),
  };
}

export function calculateInvoiceTotals(lines: CalculatedBillLine[]) {
  const subtotalPaise = lines.reduce((sum, line) => sum + line.taxableAmountPaise, 0);
  const cgstPaise = lines.reduce((sum, line) => sum + line.cgstPaise, 0);
  const sgstPaise = lines.reduce((sum, line) => sum + line.sgstPaise, 0);
  const beforeRoundOffPaise = subtotalPaise + cgstPaise + sgstPaise;
  const totalPaise = Math.floor((beforeRoundOffPaise + 50) / 100) * 100;
  return {
    subtotalPaise,
    cgstPaise,
    sgstPaise,
    roundOffPaise: totalPaise - beforeRoundOffPaise,
    totalPaise,
  };
}

export function allocatePayments(payments: PaymentInput[], totalPaise: number, hasCustomer: boolean) {
  if (!Number.isSafeInteger(totalPaise) || totalPaise < 0) {
    throw new BillCalculationError("The invoice total is invalid.");
  }

  for (const payment of payments) {
    if (!Number.isSafeInteger(payment.amountPaise) || payment.amountPaise <= 0) {
      throw new BillCalculationError("Payment amounts must be positive whole paise.");
    }
  }

  const tenderedPaise = payments.reduce((sum, payment) => sum + payment.amountPaise, 0);
  const excessPaise = Math.max(0, tenderedPaise - totalPaise);
  const cashPaise = payments.filter((payment) => payment.mode === "CASH").reduce((sum, payment) => sum + payment.amountPaise, 0);

  if (excessPaise > 0 && (cashPaise === 0 || excessPaise > cashPaise)) {
    throw new BillCalculationError("Overpayment is allowed only when cash covers the change.");
  }

  const paidPaise = Math.min(tenderedPaise, totalPaise);
  const balancePaise = totalPaise - paidPaise;
  if (balancePaise > 0 && !hasCustomer) {
    throw new BillCalculationError("Choose a customer to leave an unpaid balance.");
  }

  let changeToRecord = excessPaise;
  const normalizedPayments: CalculatedPayment[] = payments.map((payment) => {
    const changePaise = payment.mode === "CASH" && changeToRecord > 0
      ? Math.min(payment.amountPaise, changeToRecord)
      : 0;
    changeToRecord -= changePaise;
    return { ...payment, changePaise };
  });

  return { payments: normalizedPayments, paidPaise, balancePaise, changePaise: excessPaise };
}