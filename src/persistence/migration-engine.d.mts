import type { DatabaseSync } from "node:sqlite";

export type MigrationStatus = {
  appliedCount: number;
  availableCount: number;
  schemaVersion: number;
  targetSchemaVersion: number;
  compatible: boolean;
  upToDate: boolean;
};

export function getMigrationStatus(database: DatabaseSync, directory?: string): MigrationStatus;
export function runMigrations(database: DatabaseSync, directory?: string): void;
