import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

const databasePath = resolve(
  process.env.MAYDAY_DATABASE_PATH ?? join(process.cwd(), "data", "mayday-dispatch.sqlite"),
);
mkdirSync(dirname(databasePath), { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
database.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )
`);
const applied = new Set(
  database.prepare("SELECT name FROM schema_migrations").all().map((row) => row.name),
);
const directory = join(process.cwd(), "src", "persistence", "migrations");

for (const name of readdirSync(directory).filter((file) => file.endsWith(".sql")).sort()) {
  if (applied.has(name)) continue;
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(readFileSync(join(directory, name), "utf8"));
    database
      .prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)")
      .run(name, new Date().toISOString());
    database.exec("COMMIT");
    process.stdout.write(`Applied ${name}\n`);
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

database.close();
process.stdout.write(`Database is current: ${databasePath}\n`);
