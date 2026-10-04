import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { assertProductionEnvironment } from "./production-env.mjs";

try {
  assertProductionEnvironment();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Production environment validation failed.");
  process.exit(1);
}

const nextCli = resolve(process.cwd(), "node_modules/next/dist/bin/next");
const server = spawn(process.execPath, [nextCli, "start"], { stdio: "inherit", env: process.env });

server.on("error", (error) => {
  console.error("Could not start the Next.js production server.");
  console.error(error.message);
  process.exit(1);
});

server.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
