import { en } from "@/i18n/en";

type SubscriptionAccessState = {
  status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
  trialEndsAt: Date | null;
  currentPeriodEndsAt: Date | null;
};

export function canWriteWithSubscription(
  subscription: SubscriptionAccessState | null,
  now = new Date(),
): boolean {
  if (!subscription) {
    return false;
  }

  if (subscription.status === "TRIALING") {
    return subscription.trialEndsAt !== null && subscription.trialEndsAt > now;
  }

  if (subscription.status === "ACTIVE") {
    return subscription.currentPeriodEndsAt !== null && subscription.currentPeriodEndsAt > now;
  }

  return false;
}

export class SubscriptionWriteBlockedError extends Error {
  constructor() {
    super(en.errors.subscriptionExpired);
    this.name = "SubscriptionWriteBlockedError";
  }
}