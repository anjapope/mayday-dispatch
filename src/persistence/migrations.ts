import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

export type MigrationStatus = {
  appliedCount: number;
  availableCount: number;
  upToDate: boolean;
};

/**
 * Reports migration readiness without exposing any filesystem paths.
 * Used by the `/api/health` endpoint (see docs/operations.md).
 */
export function getMigrationStatus(
  database: DatabaseSync,
  migrationsDirectory = join(process.cwd(), "src", "persistence", "migrations"),
): MigrationStatus {
  const availableCount = readdirSync(migrationsDirectory).filter((file) => file.endsWith(".sql")).length;
  let appliedCount = 0;
  try {
    const row = database
      .prepare("SELECT COUNT(*) AS count FROM schema_migrations")
      .get() as { count?: number } | undefined;
    appliedCount = Number(row?.count ?? 0);
  } catch {
    appliedCount = 0;
  }

  return {
    appliedCount,
    availableCount,
    upToDate: appliedCount === availableCount,
  };
}

export function runMigrations(
  database: DatabaseSync,
  migrationsDirectory = join(process.cwd(), "src", "persistence", "migrations"),
): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = new Set(
    database
      .prepare("SELECT name FROM schema_migrations")
      .all()
      .map((row) => String(row.name)),
  );

  for (const name of readdirSync(migrationsDirectory).filter((file) => file.endsWith(".sql")).sort()) {
    if (applied.has(name)) {
      continue;
    }

    const sql = readFileSync(join(migrationsDirectory, name), "utf8");
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(sql);
      database
        .prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)")
        .run(name, new Date().toISOString());
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
}
