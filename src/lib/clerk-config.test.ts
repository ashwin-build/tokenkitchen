import { describe, expect, it } from "vitest";
import { assertProductionClerkKeys } from "@/lib/clerk-config";

describe("production Clerk startup configuration", () => {
  it("requires both keys when a production server starts", () => {
    expect(() => assertProductionClerkKeys({ NODE_ENV: "production" })).toThrow(
      "Production startup requires",
    );
  });

  it("allows builds and non-production startup without production keys", () => {
    expect(() => assertProductionClerkKeys({
      NODE_ENV: "production",
      NEXT_PHASE: "phase-production-build",
    })).not.toThrow();
    expect(() => assertProductionClerkKeys({ NODE_ENV: "development" })).not.toThrow();
  });
});