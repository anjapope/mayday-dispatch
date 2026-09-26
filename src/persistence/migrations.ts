import type { DatabaseSync } from "node:sqlite";
import {
  getMigrationStatus as getStatus,
  runMigrations as applyMigrations,
  type MigrationStatus,
} from "./migration-engine.mjs";

export type { MigrationStatus } from "./migration-engine.mjs";

export function getMigrationStatus(
  database: DatabaseSync,
  migrationsDirectory?: string,
): MigrationStatus {
  return getStatus(database, migrationsDirectory);
}

export function runMigrations(
  database: DatabaseSync,
  migrationsDirectory?: string,
): void {
  applyMigrations(database, migrationsDirectory);
}
