export type SubscriptionTaxBreakdown = {
  taxableAmountPaise: number;
  gstAmountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  totalPaise: number;
};

export function calculateSubscriptionTax(
  amountPaise: number,
  gstInclusive: boolean,
  gstRate: number,
): SubscriptionTaxBreakdown {
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 0 || !Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100) {
    throw new Error("Subscription price or GST rate is invalid.");
  }

  const rateBasisPoints = BigInt(Math.round(gstRate * 100));
  const amount = BigInt(amountPaise);
  const gstAmount = gstInclusive
    ? (amount * rateBasisPoints + (BigInt(10000) + rateBasisPoints) / BigInt(2)) / (BigInt(10000) + rateBasisPoints)
    : (amount * rateBasisPoints + BigInt(5000)) / BigInt(10000);
  const taxableAmount = gstInclusive ? amount - gstAmount : amount;
  const total = gstInclusive ? amount : amount + gstAmount;
  const cgst = gstAmount / BigInt(2);
  const sgst = gstAmount - cgst;
  const values = [taxableAmount, gstAmount, cgst, sgst, total];
  if (values.some((value) => value > BigInt(2147483647))) {
    throw new Error("Subscription invoice exceeds the supported paise range.");
  }

  return {
    taxableAmountPaise: Number(taxableAmount),
    gstAmountPaise: Number(gstAmount),
    cgstPaise: Number(cgst),
    sgstPaise: Number(sgst),
    totalPaise: Number(total),
  };
}