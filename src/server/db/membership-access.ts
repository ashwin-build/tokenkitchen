import { randomUUID } from "node:crypto";
import { platformPrisma } from "@/server/db/prisma";

export const activeTenantCookieName = "tokenkitchen_active_tenant";

export async function membershipsForClerkUser(clerkUserId: string) {
  return platformPrisma.membership.findMany({
    where: { clerkUserId, isActive: true },
    include: { tenant: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function createBusinessForClerkUser(input: {
  clerkUserId: string;
  email: string;
  displayName?: string;
  businessName: string;
}) {
  const baseSlug = input.businessName
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42) || "business";
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  return platformPrisma.$transaction(async (transaction) => {
    const tenant = await transaction.tenant.create({
      data: {
        name: input.businessName,
        slug: `${baseSlug}-${randomUUID().slice(0, 8)}`,
      },
    });

    await transaction.membership.create({
      data: {
        tenantId: tenant.id,
        clerkUserId: input.clerkUserId,
        email: input.email,
        displayName: input.displayName,
        role: "OWNER",
      },
    });

    await transaction.subscription.create({
      data: {
        tenantId: tenant.id,
        status: "TRIALING",
        trialStartedAt: now,
        trialEndsAt,
      },
    });

    return tenant;
  });
}