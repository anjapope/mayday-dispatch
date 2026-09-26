import { join, resolve } from "node:path";
import process from "node:process";
import {
  assertDatabaseWritable,
  assertMigrationReady,
  createConsistentBackup,
  productionDatabasePath,
} from "./runtime-operations.mjs";

const databasePath = process.env.NODE_ENV === "production"
  ? productionDatabasePath()
  : resolve(process.env.MAYDAY_DATABASE_PATH ?? join(process.cwd(), "data", "mayday-dispatch.sqlite"));
const backupPath = process.argv[2];
if (!backupPath) {
  throw new Error("Usage: npm run db:backup -- <new-backup-file>");
}
assertDatabaseWritable(databasePath);
assertMigrationReady(databasePath);
const result = createConsistentBackup(databasePath, resolve(backupPath));
process.stdout.write(`${JSON.stringify({
  timestamp: new Date().toISOString(),
  operation: "database.backup",
  result: "success",
})}\n`);
process.stdout.write(`Consistent SQLite backup created: ${result}\n`);
