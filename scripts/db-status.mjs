import { join, resolve } from "node:path";
import process from "node:process";
import {
  assertDatabaseWritable,
  assertMigrationReady,
  productionDatabasePath,
} from "./runtime-operations.mjs";

const databasePath = process.env.NODE_ENV === "production"
  ? productionDatabasePath()
  : resolve(process.env.MAYDAY_DATABASE_PATH ?? join(process.cwd(), "data", "mayday-dispatch.sqlite"));
assertDatabaseWritable(databasePath);
const status = assertMigrationReady(databasePath);
process.stdout.write(`Database schema ${status.schemaVersion} is current.\n`);
