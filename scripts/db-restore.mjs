import { resolve } from "node:path";
import process from "node:process";
import { restoreBackup } from "./runtime-operations.mjs";

const [backupPath, targetPath] = process.argv.slice(2);
if (!backupPath || !targetPath) {
  throw new Error("Usage: npm run db:restore -- <backup-file> <new-target-file>");
}
const restoredPath = restoreBackup(resolve(backupPath), resolve(targetPath));
process.stdout.write(`${JSON.stringify({
  timestamp: new Date().toISOString(),
  operation: "database.restore",
  result: "success",
})}\n`);
process.stdout.write(`Validated backup restored to new database file: ${restoredPath}\n`);
