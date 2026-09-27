import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const DEFAULT_MIGRATIONS_DIRECTORY = join(process.cwd(), "src", "persistence", "migrations");

function migrationFiles(directory) {
  return readdirSync(directory).filter((file) => /^\d{3}_.+\.sql$/.test(file)).sort();
}

function checksum(sql) {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

function trackerHasChecksum(database) {
  try {
    return database.prepare("PRAGMA table_info(schema_migrations)")
      .all().some((row) => row.name === "checksum");
  } catch {
    return false;
  }
}

function readMigrationRecords(database) {
  const hasChecksum = trackerHasChecksum(database);
  try {
    return database.prepare(
      hasChecksum
        ? "SELECT name, checksum FROM schema_migrations ORDER BY name"
        : "SELECT name, NULL AS checksum FROM schema_migrations ORDER BY name",
    ).all().map((row) => ({
      name: String(row.name),
      checksum: row.checksum === null ? null : String(row.checksum),
    }));
  } catch {
    return [];
  }
}

function inspectMigrations(database, directory) {
  const files = migrationFiles(directory);
  const records = readMigrationRecords(database);
  const knownFiles = new Set(files);
  const appliedNames = records.map((record) => record.name);
  const prefixMatches = appliedNames.every((name, index) => files[index] === name);
  const known = records.every((record) => knownFiles.has(record.name));
  const checksumsMatch = records.every((record) => {
    if (!knownFiles.has(record.name)) return false;
    if (record.checksum === null) return true;
    return record.checksum === checksum(readFileSync(join(directory, record.name), "utf8"));
  });
  let trackerExists = records.length > 0 || trackerHasChecksum(database);
  if (!trackerExists) {
    try {
      database.prepare("SELECT 1 FROM schema_migrations LIMIT 1").get();
      trackerExists = true;
    } catch {
      trackerExists = false;
    }
  }
  const compatible =
    files.length > 0 && trackerExists && known && prefixMatches && checksumsMatch;
  const schemaVersion = records.length
    ? Number(records[records.length - 1].name.slice(0, 3))
    : 0;
  const targetSchemaVersion = files.length ? Number(files[files.length - 1].slice(0, 3)) : 0;
  const upToDate = compatible && appliedNames.length === files.length;
  return {
    files,
    records,
    status: {
      appliedCount: records.length,
      availableCount: files.length,
      schemaVersion,
      targetSchemaVersion,
      compatible,
      upToDate,
    },
  };
}

export function getMigrationStatus(database, directory = DEFAULT_MIGRATIONS_DIRECTORY) {
  return inspectMigrations(database, directory).status;
}

export function runMigrations(database, directory = DEFAULT_MIGRATIONS_DIRECTORY) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
  const initial = inspectMigrations(database, directory);
  if (!initial.status.compatible) {
    throw new Error("The database has an unknown, out-of-order, or incompatible migration state.");
  }

  for (const name of initial.files) {
    const sql = readFileSync(join(directory, name), "utf8");
    const applied = initial.records.find((record) => record.name === name);
    if (applied?.checksum && applied.checksum !== checksum(sql)) {
      throw new Error(`Applied migration ${name} has changed since it was recorded.`);
    }
    if (applied) continue;

    database.exec("BEGIN IMMEDIATE");
    try {
      const appliedByConcurrentRunner = readMigrationRecords(database)
        .find((record) => record.name === name);
      if (appliedByConcurrentRunner) {
        if (appliedByConcurrentRunner.checksum && appliedByConcurrentRunner.checksum !== checksum(sql)) {
          throw new Error(`Applied migration ${name} has changed since it was recorded.`);
        }
      } else {
        database.exec(sql);
        if (trackerHasChecksum(database)) {
          database.prepare(
            "INSERT INTO schema_migrations (name, applied_at, checksum) VALUES (?, ?, ?)",
          ).run(name, new Date().toISOString(), checksum(sql));
          for (const migrationName of initial.files) {
            database.prepare(
              "UPDATE schema_migrations SET checksum = ? WHERE name = ? AND checksum IS NULL",
            ).run(
              checksum(readFileSync(join(directory, migrationName), "utf8")),
              migrationName,
            );
          }
        } else {
          database.prepare(
            "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
          ).run(name, new Date().toISOString());
        }
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }

    if (!inspectMigrations(database, directory).status.compatible) {
      throw new Error(`Migration ${name} left the database in an incompatible state.`);
    }
  }

  if (!inspectMigrations(database, directory).status.upToDate) {
    throw new Error("Migration execution completed without reaching the current schema version.");
  }
}
