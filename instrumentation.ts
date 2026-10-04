import { assertProductionClerkKeys } from "@/lib/clerk-config";

export async function register() {
  assertProductionClerkKeys(process.env);
}