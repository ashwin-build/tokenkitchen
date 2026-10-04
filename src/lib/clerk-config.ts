type ClerkEnvironment = {
  NODE_ENV?: string;
  NEXT_PHASE?: string;
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
  CLERK_SECRET_KEY?: string;
};

export function assertProductionClerkKeys(environment: ClerkEnvironment): void {
  if (environment.NODE_ENV !== "production" || environment.NEXT_PHASE === "phase-production-build") {
    return;
  }

  if (!environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !environment.CLERK_SECRET_KEY) {
    throw new Error("Production startup requires NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY.");
  }
}