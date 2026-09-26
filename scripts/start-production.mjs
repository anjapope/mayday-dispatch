import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import {
  acquireDatabaseProcessLock,
  assertDatabaseWritable,
  assertMigrationReady,
  validateProductionEnvironment,
} from "./runtime-operations.mjs";

let releaseLock;
let server;
let shuttingDown = false;
let finished = false;

function log(operation, result) {
  process.stdout.write(`${JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "mayday-dispatch",
    operation,
    result,
  })}\n`);
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("application.shutdown", "started");
  if (server && !server.killed) server.kill(signal);
  else finish(0);
}

function finish(code) {
  if (finished) return;
  finished = true;
  releaseLock?.();
  log("application.shutdown", code === 0 ? "success" : "error");
  process.exitCode = code;
}

try {
  process.env.NODE_ENV = "production";
  const { databasePath } = validateProductionEnvironment();
  releaseLock = acquireDatabaseProcessLock(databasePath);
  assertDatabaseWritable(databasePath);
  const status = assertMigrationReady(databasePath);
  const standaloneServer = resolve(process.cwd(), "server.js");
  const localStandaloneDirectory = resolve(process.cwd(), ".next", "standalone");
  const localStandaloneServer = resolve(localStandaloneDirectory, "server.js");
  const useLocalStandalone = !existsSync(standaloneServer) && existsSync(localStandaloneServer);
  const serverPath = existsSync(standaloneServer)
    ? standaloneServer
    : useLocalStandalone
      ? localStandaloneServer
      : undefined;
  if (!serverPath) {
    throw new Error("The production standalone server is missing; run npm run build first.");
  }
  const serverEnvironment = {
    ...process.env,
    NODE_ENV: "production",
    HOSTNAME: process.env.HOSTNAME || "0.0.0.0",
    PORT: process.env.PORT || "3000",
  };
  server = spawn(process.execPath, [serverPath], {
    cwd: useLocalStandalone ? localStandaloneDirectory : process.cwd(),
    env: serverEnvironment,
    stdio: "inherit",
  });
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  server.once("error", () => finish(1));
  server.once("exit", (code, signal) => {
    if (!shuttingDown) log("application.shutdown", signal ?? code ?? "unknown");
    finish(code ?? 1);
  });
  log("application.startup", `ready-schema-${status.schemaVersion}`);
} catch (error) {
  releaseLock?.();
  const message = error instanceof Error ? error.message : "Unknown startup validation failure.";
  process.stderr.write(`Production startup validation failed: ${message}\n`);
  process.exitCode = 1;
}
