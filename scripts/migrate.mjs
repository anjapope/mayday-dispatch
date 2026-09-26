import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import { getMigrationStatus, runMigrations } from "../src/persistence/migration-engine.mjs";
import {
  acquireDatabaseProcessLock,
  createConsistentBackup,
  existingSchemaHasAppliedMigrations,
  productionDatabasePath,
} from "./runtime-operations.mjs";

function backupArgument(args) {
  const index = args.indexOf("--backup");
  if (index < 0) return undefined;
  const path = args[index + 1];
  if (!path || path.startsWith("--")) {
    throw new Error("Provide a new backup file path after --backup.");
  }
  return resolve(path);
}

const production = process.env.NODE_ENV === "production";
const databasePath = production
  ? productionDatabasePath()
  : resolve(process.env.MAYDAY_DATABASE_PATH ?? join(process.cwd(), "data", "mayday-dispatch.sqlite"));
mkdirSync(dirname(databasePath), { recursive: true });
const releaseLock = acquireDatabaseProcessLock(databasePath);
let database;

try {
  const databaseExisted = existsSync(databasePath);
  database = new DatabaseSync(databasePath);
  database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

  const hadAppliedMigrations = databaseExisted && existingSchemaHasAppliedMigrations(database);
  const before = getMigrationStatus(database);
  if (hadAppliedMigrations && !before.compatible) {
    throw new Error("Refusing to migrate an unknown, out-of-order, or checksum-incompatible database.");
  }
  if (production && hadAppliedMigrations && !before.upToDate) {
    const backupPath = backupArgument(process.argv.slice(2));
    if (!backupPath) {
      throw new Error("A consistent pre-migration backup is required: npm run db:migrate -- --backup <new-file>.");
    }
    createConsistentBackup(databasePath, backupPath);
    process.stdout.write(`${JSON.stringify({
      timestamp: new Date().toISOString(),
      operation: "database.backup",
      result: "success",
    })}\n`);
    process.stdout.write(`Created consistent pre-migration backup: ${backupPath}\n`);
  }

  runMigrations(database);
  const after = getMigrationStatus(database);
  if (!after.upToDate) {
    throw new Error("Migration command ended without reaching the current compatible schema.");
  }
  process.stdout.write(`${JSON.stringify({
    timestamp: new Date().toISOString(),
    operation: "database.migration",
    result: "success",
    schemaVersion: after.schemaVersion,
    appliedCount: after.appliedCount,
  })}\n`);
  process.stdout.write(`Database schema ${after.schemaVersion} is current (${after.appliedCount} migrations).\n`);
} finally {
  database?.close();
  releaseLock();
}
