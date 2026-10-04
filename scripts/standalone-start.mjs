import { assertProductionEnvironment } from "./production-env.mjs";

try {
  assertProductionEnvironment();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Production environment validation failed.");
  process.exit(1);
}

await import("./server.js");
