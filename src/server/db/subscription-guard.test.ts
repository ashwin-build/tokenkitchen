import { describe, expect, it } from "vitest";
import { canWriteWithSubscription } from "@/server/db/subscription-guard";

describe("subscription write access", () => {
  const now = new Date("2026-10-03T12:00:00.000Z");

  it("allows an unexpired trial and active plan", () => {
    expect(canWriteWithSubscription({
      status: "TRIALING",
      trialEndsAt: new Date("2026-10-04T12:00:00.000Z"),
      currentPeriodEndsAt: null,
    }, now)).toBe(true);

    expect(canWriteWithSubscription({
      status: "ACTIVE",
      trialEndsAt: null,
      currentPeriodEndsAt: new Date("2026-11-03T12:00:00.000Z"),
    }, now)).toBe(true);
  });

  it("blocks ended trials, ended plans, missing subscriptions, and non-paid states", () => {
    expect(canWriteWithSubscription({
      status: "TRIALING",
      trialEndsAt: new Date("2026-10-03T11:59:59.000Z"),
      currentPeriodEndsAt: null,
    }, now)).toBe(false);

    expect(canWriteWithSubscription({
      status: "ACTIVE",
      trialEndsAt: null,
      currentPeriodEndsAt: null,
    }, now)).toBe(false);
    expect(canWriteWithSubscription(null, now)).toBe(false);
    expect(canWriteWithSubscription({
      status: "PAST_DUE",
      trialEndsAt: null,
      currentPeriodEndsAt: new Date("2026-11-03T12:00:00.000Z"),
    }, now)).toBe(false);
  });
});