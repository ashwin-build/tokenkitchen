import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/lib/env";
import { tenantScopeExtension } from "@/server/db/tenant-scope";

const globalForPrisma = globalThis as unknown as {
  prismaClient?: PrismaClient;
};

const prismaClient =
  globalForPrisma.prismaClient ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: getEnv().DATABASE_URL, max: 30 }),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaClient = prismaClient;
}

export const platformPrisma = prismaClient;

export function tenantDatabase(tenantId: string) {
  return prismaClient.$extends(tenantScopeExtension(tenantId, () =>
    prismaClient.subscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { status: true, trialEndsAt: true, currentPeriodEndsAt: true },
    }),
  ));
}

export function systemTenantDatabase(tenantId: string) {
  return prismaClient.$extends(tenantScopeExtension(tenantId));
}