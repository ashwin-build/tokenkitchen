import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { activeTenantCookieName, membershipsForClerkUser } from "@/server/db/membership-access";

export async function activeMembershipForCurrentUser() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const memberships = await membershipsForClerkUser(userId);

  if (memberships.length === 0) {
    redirect("/onboarding");
  }

  const cookieStore = await cookies();
  const requestedTenantId = cookieStore.get(activeTenantCookieName)?.value;
  return memberships.find((membership) => membership.tenantId === requestedTenantId) ?? memberships[0];
}