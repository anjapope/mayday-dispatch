import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { getMigrationStatus, runMigrations } from "@/persistence/migrations";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

function createMigrationDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "mayday-migrations-"));
  temporaryDirectories.push(directory);
  writeFileSync(join(directory, "001_initial.sql"), "CREATE TABLE records (id INTEGER PRIMARY KEY);");
  writeFileSync(join(directory, "002_checksums.sql"), "ALTER TABLE schema_migrations ADD COLUMN checksum TEXT;");
  return directory;
}

describe("migration engine", () => {
  it("tracks schema version, pins checksums, and refuses changed applied migrations", () => {
    const directory = createMigrationDirectory();
    const database = new DatabaseSync(":memory:");
    runMigrations(database, directory);
    expect(getMigrationStatus(database, directory)).toMatchObject({
      schemaVersion: 2,
      targetSchemaVersion: 2,
      compatible: true,
      upToDate: true,
    });

    const appliedChecksum = database
      .prepare("SELECT checksum FROM schema_migrations WHERE name = '001_initial.sql'")
      .get()?.checksum;
    expect(appliedChecksum).toMatch(/^[a-f0-9]{64}$/);
    writeFileSync(join(directory, "001_initial.sql"), "CREATE TABLE changed (id INTEGER PRIMARY KEY);");
    expect(getMigrationStatus(database, directory).compatible).toBe(false);
    expect(() => runMigrations(database, directory)).toThrow(/incompatible migration state/);
    database.close();
  });

  it("refuses unknown and out-of-order applied migration records", () => {
    const directory = createMigrationDirectory();
    const database = new DatabaseSync(":memory:");
    runMigrations(database, directory);
    database.prepare(`
      INSERT INTO schema_migrations (name, applied_at, checksum)
      VALUES ('003_unknown.sql', '2026-09-26T00:00:00.000Z', 'not-a-checksum')
    `).run();
    expect(getMigrationStatus(database, directory).compatible).toBe(false);
    expect(() => runMigrations(database, directory)).toThrow(/incompatible migration state/);
    database.close();
  });

  it("upgrades legacy migration tracking without erasing earlier schema", () => {
    const directory = createMigrationDirectory();
    const database = new DatabaseSync(":memory:");
    database.exec(`
      CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE records (id INTEGER PRIMARY KEY);
    `);
    database
      .prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)")
      .run("001_initial.sql", "2026-09-26T00:00:00.000Z");
    expect(getMigrationStatus(database, directory).compatible).toBe(true);
    expect(getMigrationStatus(database, directory).upToDate).toBe(false);
    runMigrations(database, directory);
    expect(getMigrationStatus(database, directory).upToDate).toBe(true);
    expect(database.prepare("SELECT checksum FROM schema_migrations WHERE name = '001_initial.sql'").get()?.checksum)
      .toMatch(/^[a-f0-9]{64}$/);
    database.close();
  });
});
