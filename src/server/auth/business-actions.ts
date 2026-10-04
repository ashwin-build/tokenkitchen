"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { activeTenantCookieName, createBusinessForClerkUser, membershipsForClerkUser } from "@/server/db/membership-access";

const businessNameSchema = z.string().trim().min(2).max(80);
const tenantIdSchema = z.string().cuid();

async function setActiveTenantCookie(tenantId: string) {
  const cookieStore = await cookies();
  cookieStore.set(activeTenantCookieName, tenantId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export async function createBusinessAction(formData: FormData) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const businessName = businessNameSchema.safeParse(formData.get("businessName"));
  if (!businessName.success) redirect("/onboarding?error=business-name");

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  if (!email) redirect("/onboarding?error=email");

  const tenant = await createBusinessForClerkUser({
    clerkUserId: userId,
    email,
    displayName: user.fullName ?? undefined,
    businessName: businessName.data,
  });

  await setActiveTenantCookie(tenant.id);
  redirect("/dashboard");
}

export async function switchBusinessAction(formData: FormData) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const tenantId = tenantIdSchema.safeParse(formData.get("tenantId"));
  if (!tenantId.success) redirect("/dashboard?error=business");

  const memberships = await membershipsForClerkUser(userId);
  if (!memberships.some((membership) => membership.tenantId === tenantId.data)) {
    redirect("/dashboard?error=business");
  }

  await setActiveTenantCookie(tenantId.data);
  redirect("/dashboard");
}