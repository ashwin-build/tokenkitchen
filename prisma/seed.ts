import { PrismaPg } from "@prisma/adapter-pg";
import { PlanCode, PrismaClient } from "../src/generated/prisma/client";
import { getEnv } from "../src/lib/env";

const client = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getEnv().DATABASE_URL }),
});

const plans = [
  { code: PlanCode.QUARTERLY, name: "Quarterly", periodDays: 90, amountPaise: 69900 },
  { code: PlanCode.HALF_YEARLY, name: "Half-yearly", periodDays: 180, amountPaise: 109900 },
  { code: PlanCode.ANNUAL, name: "Annual", periodDays: 365, amountPaise: 219900 },
];

async function main() {
  try {
    for (const plan of plans) {
      await client.planCatalog.upsert({
        where: { code: plan.code },
        create: {
          ...plan,
          gstInclusive: true,
          gstRate: "18.00",
          taxReviewRequired: true,
        },
        update: {
          name: plan.name,
          periodDays: plan.periodDays,
          amountPaise: plan.amountPaise,
          gstInclusive: true,
          gstRate: "18.00",
          taxReviewRequired: true,
        },
      });
    }
  } finally {
    await client.$disconnect();
  }
}

void main();