import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/persistence/migration-engine.mjs";
import {
  acquireDatabaseProcessLock,
  createConsistentBackup,
  productionDatabasePath,
  restoreBackup,
  validateProductionEnvironment,
} from "./runtime-operations.mjs";

const temporaryDirectories = [];
const environmentNames = [
  "MAYDAY_DATABASE_PATH",
  "MAYDAY_SESSION_SECRET",
  "MAYDAY_SESSION_SECRET_FILE",
  "MAYDAY_APPLICATION_CREDENTIALS",
  "MAYDAY_APPLICATION_CREDENTIALS_FILE",
  "MAYDAY_TRUST_DEV_HEADERS",
  "MAYDAY_PUBLIC_BASE_URL",
];
const originalEnvironment = Object.fromEntries(
  environmentNames.map((name) => [name, process.env[name]]),
);

afterEach(() => {
  for (const name of environmentNames) {
    if (originalEnvironment[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnvironment[name];
  }
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "mayday-production-"));
  temporaryDirectories.push(directory);
  return directory;
}

function validCredentials() {
  return [
    ["Research Studio", "research-service", ["external-application"]],
    ["overwatch", "overwatch-service", ["external-application"]],
    ["mayday3", "mayday3-service", ["external-application"]],
    ["Dispatch Editorial", "publisher-account", ["editor", "publisher"]],
    ["Dispatch Operations", "operator-account", ["operator"]],
  ].map(([applicationName, subjectId, roles], index) => ({
    applicationName,
    subjectId,
    roles,
    tokenHash: (index + 1).toString(16).padStart(64, "0"),
  }));
}

describe("production runtime operations", () => {
  it("requires separated production credentials, session signing, persistent storage, and HTTPS canonical URL", () => {
    const directory = temporaryDirectory();
    process.env.MAYDAY_DATABASE_PATH = join(directory, "dispatch.sqlite");
    process.env.MAYDAY_SESSION_SECRET = "a".repeat(48);
    process.env.MAYDAY_APPLICATION_CREDENTIALS = JSON.stringify(validCredentials());
    process.env.MAYDAY_TRUST_DEV_HEADERS = "false";
    process.env.MAYDAY_PUBLIC_BASE_URL = "https://dispatch.example.test";

    expect(validateProductionEnvironment().databasePath).toBe(resolve(process.env.MAYDAY_DATABASE_PATH));

    process.env.MAYDAY_APPLICATION_CREDENTIALS = JSON.stringify(
      validCredentials().map((credential) =>
        credential.applicationName === "mayday3"
          ? { ...credential, roles: ["external-application", "publisher"] }
          : credential,
      ),
    );
    expect(() => validateProductionEnvironment()).toThrow(/dedicated external-application credential/);
    process.env.MAYDAY_DATABASE_PATH = resolve("public", "not-a-database.sqlite");
    expect(() => productionDatabasePath()).toThrow(/outside the public asset directory/);
  });

  it("does not acquire a second database writer lock until the first is released", () => {
    const databasePath = join(temporaryDirectory(), "dispatch.sqlite");
    const release = acquireDatabaseProcessLock(databasePath);
    expect(() => acquireDatabaseProcessLock(databasePath)).toThrow(/process lock exists/);
    release();
    expect(() => acquireDatabaseProcessLock(databasePath)()).not.toThrow();
  });

  it("makes consistent SQLite backups and restores only into new disposable storage", () => {
    const directory = temporaryDirectory();
    const databasePath = join(directory, "dispatch.sqlite");
    const backupPath = join(directory, "backups", "dispatch.sqlite");
    const restoredPath = join(directory, "restore", "dispatch.sqlite");
    const database = new DatabaseSync(databasePath);
    runMigrations(database);
    database.prepare("INSERT INTO operational_audit_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        "test-event",
        "2026-09-26T00:00:00.000Z",
        "operator",
        '["operator"]',
        "Dispatch Operations",
        "publication_lockdown.activated",
        "publication-lockdown",
        1,
        "test-correlation",
        "test-request",
      );
    database.close();

    expect(createConsistentBackup(databasePath, backupPath)).toBe(backupPath);
    expect(restoreBackup(backupPath, restoredPath)).toBe(restoredPath);
    const restored = new DatabaseSync(restoredPath, { readOnly: true });
    expect(restored.prepare("SELECT actor_subject FROM operational_audit_events WHERE id = 'test-event'").get())
      .toMatchObject({ actor_subject: "operator" });
    restored.close();
    expect(() => restoreBackup(backupPath, restoredPath)).toThrow(/new, distinct destination/);
  });
});
