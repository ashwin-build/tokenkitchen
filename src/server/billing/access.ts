import { activeMembershipForCurrentUser } from "@/server/auth/active-membership";

export async function currentBillingMembership() {
  const membership = await activeMembershipForCurrentUser();
  return {
    tenantId: membership.tenantId,
    role: membership.role,
    clerkUserId: membership.clerkUserId,
    email: membership.email,
  };
}