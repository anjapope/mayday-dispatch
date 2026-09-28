import { Buffer } from "node:buffer";
import { accessSync, closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync, chmodSync } from "node:fs";
import { constants as fsConstants } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { hostname } from "node:os";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import { URL } from "node:url";
import { getMigrationStatus, runMigrations } from "../src/persistence/migration-engine.mjs";

const MIGRATIONS_DIRECTORY = resolve(process.cwd(), "src", "persistence", "migrations");
const REQUIRED_INTEGRATIONS = ["research studio", "overwatch", "mayday3"];
const SUPPORTED_ROLES = new Set([
  "external-application",
  "editor",
  "publisher",
  "admin",
  "operator",
  "public-reader",
]);

export function productionDatabasePath() {
  const configured = process.env.MAYDAY_DATABASE_PATH;
  if (!configured || !isAbsolute(configured) || configured === ":memory:") {
    throw new Error("Production requires an absolute MAYDAY_DATABASE_PATH.");
  }
  const databasePath = resolve(configured);
  assertOutsidePublic(databasePath);
  return databasePath;
}

function assertOutsidePublic(path) {
  const publicDirectory = resolve(process.cwd(), "public");
  const canonicalPublicDirectory = existsSync(publicDirectory)
    ? realpathSync(publicDirectory)
    : publicDirectory;
  let ancestor = resolve(path);
  const remaining = [];
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) break;
    remaining.unshift(ancestor.slice(parent.length + 1));
    ancestor = parent;
  }
  const canonicalPath = resolve(realpathSync(ancestor), ...remaining);
  const pathFromPublic = relative(canonicalPublicDirectory, canonicalPath);
  if (
    pathFromPublic === "" ||
    (pathFromPublic !== ".." && !pathFromPublic.startsWith(`..${sep}`) && !isAbsolute(pathFromPublic))
  ) {
    throw new Error("Database, backup, and restore files must be outside the public asset directory.");
  }
}

export function configuredCredentials() {
  const configuredFile = process.env.MAYDAY_APPLICATION_CREDENTIALS_FILE;
  const configuredJson = process.env.MAYDAY_APPLICATION_CREDENTIALS;
  if (configuredFile && configuredJson) {
    throw new Error("Configure only one application credential source.");
  }
  if (!configuredFile && !configuredJson) {
    throw new Error("Production requires MAYDAY_APPLICATION_CREDENTIALS or MAYDAY_APPLICATION_CREDENTIALS_FILE.");
  }

  let raw;
  try {
    raw = configuredFile ? readFileSync(configuredFile, "utf8") : configuredJson;
  } catch {
    throw new Error("The configured application credential file could not be read.");
  }
  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error("The application credential configuration must be valid JSON.");
  }
  if (!Array.isArray(credentials) || credentials.length === 0) {
    throw new Error("The application credential configuration must contain credential records.");
  }

  const identities = new Set();
  const tokenHashes = new Set();
  const hmacSecrets = new Set();
  for (const credential of credentials) {
    if (
      !credential ||
      typeof credential.applicationName !== "string" ||
      !credential.applicationName.trim() ||
      typeof credential.subjectId !== "string" ||
      !credential.subjectId.trim() ||
      !Array.isArray(credential.roles) ||
      credential.roles.length === 0 ||
      credential.roles.some((role) => !SUPPORTED_ROLES.has(role)) ||
      (credential.tokenHash !== undefined && !/^[a-f0-9]{64}$/i.test(credential.tokenHash)) ||
      (credential.hmacSecret !== undefined &&
        (typeof credential.hmacSecret !== "string" || credential.hmacSecret.length < 16)) ||
      (!credential.tokenHash && !credential.hmacSecret) ||
      Object.keys(credential).some((key) =>
        !["applicationName", "subjectId", "roles", "tokenHash", "hmacSecret"].includes(key),
      )
    ) {
      throw new Error("An application credential record is invalid or lacks a supported secret.");
    }
    const identity = `${credential.applicationName.toLowerCase()}\n${credential.subjectId}`;
    if (identities.has(identity)) {
      throw new Error("Application credential identities must be unique.");
    }
    identities.add(identity);
    if (credential.tokenHash) {
      const tokenHash = credential.tokenHash.toLowerCase();
      if (tokenHashes.has(tokenHash)) throw new Error("Bearer credentials must not be reused.");
      tokenHashes.add(tokenHash);
    }
    if (credential.hmacSecret) {
      if (hmacSecrets.has(credential.hmacSecret)) {
        throw new Error("Signed-request credentials must not be reused.");
      }
      hmacSecrets.add(credential.hmacSecret);
    }
  }
  return credentials;
}

export function validateProductionEnvironment() {
  const databasePath = productionDatabasePath();
  const sessionSecretFile = process.env.MAYDAY_SESSION_SECRET_FILE;
  const sessionSecret = process.env.MAYDAY_SESSION_SECRET;
  if (sessionSecretFile && sessionSecret) {
    throw new Error("Configure only one editorial session key source.");
  }
  let resolvedSessionSecret = sessionSecret;
  if (sessionSecretFile) {
    try {
      resolvedSessionSecret = readFileSync(sessionSecretFile, "utf8").trimEnd();
    } catch {
      throw new Error("The configured editorial session key file could not be read.");
    }
  }
  if (
    !resolvedSessionSecret ||
    Buffer.byteLength(resolvedSessionSecret, "utf8") < 32
  ) {
    throw new Error("Production requires a session signing key of at least 32 bytes.");
  }
  if (process.env.MAYDAY_TRUST_DEV_HEADERS === "true") {
    throw new Error("MAYDAY_TRUST_DEV_HEADERS must not be enabled in production.");
  }
  if (
    process.env.MAYDAY_PUBLIC_INDEXING_DISABLED !== undefined &&
    !["true", "false"].includes(process.env.MAYDAY_PUBLIC_INDEXING_DISABLED)
  ) {
    throw new Error("MAYDAY_PUBLIC_INDEXING_DISABLED must be true or false when configured.");
  }

  const credentials = configuredCredentials();
  for (const applicationName of REQUIRED_INTEGRATIONS) {
    const integrations = credentials.filter(
      (credential) => credential.applicationName.toLowerCase() === applicationName,
    );
    if (
      integrations.length === 0 ||
      integrations.some(
        (integration) =>
          integration.roles.length !== 1 || integration.roles[0] !== "external-application",
      )
    ) {
      throw new Error(`Production requires a dedicated external-application credential for ${applicationName}.`);
    }
  }
  if (
    !credentials.some((credential) =>
      credential.roles.includes("editor") && !credential.roles.includes("external-application"),
    )
  ) {
    throw new Error("Production requires at least one non-integration editorial account.");
  }
  if (
    !credentials.some((credential) =>
      credential.roles.includes("publisher") && !credential.roles.includes("external-application"),
    )
  ) {
    throw new Error("Production requires at least one non-integration publisher account.");
  }
  const operators = credentials.filter((credential) => credential.roles.includes("operator"));
  if (
    operators.length === 0 ||
    operators.some((credential) =>
      credential.roles.includes("publisher") ||
      credential.roles.includes("admin") ||
      credential.roles.includes("external-application"),
    )
  ) {
    throw new Error("Production requires a dedicated operator account separate from publishing.");
  }
  const publicBaseUrl = process.env.MAYDAY_PUBLIC_BASE_URL;
  if (publicBaseUrl) {
    let parsed;
    try {
      parsed = new URL(publicBaseUrl);
    } catch {
      throw new Error("MAYDAY_PUBLIC_BASE_URL must be a valid HTTPS origin.");
    }
    if (
      parsed.protocol !== "https:" ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error("MAYDAY_PUBLIC_BASE_URL must be an HTTPS origin without a path, query, or fragment.");
    }
  }
  const editorialOrigin = process.env.MAYDAY_EDITORIAL_ORIGIN;
  if (editorialOrigin) {
    let parsed;
    try {
      parsed = new URL(editorialOrigin);
    } catch {
      throw new Error("MAYDAY_EDITORIAL_ORIGIN must be a valid HTTPS origin.");
    }
    const localHttpOrigin =
      parsed.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) &&
      process.env.MAYDAY_PUBLIC_INDEXING_DISABLED === "true";
    if (
      (!localHttpOrigin && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error(
        "MAYDAY_EDITORIAL_ORIGIN must be an HTTPS origin; HTTP is allowed only for loopback staging with indexing disabled.",
      );
    }
  }
  return { databasePath, credentials };
}

export function migrationStatus(databasePath, migrationsDirectory = MIGRATIONS_DIRECTORY) {
  const database = new DatabaseSync(databasePath);
  try {
    return getMigrationStatus(database, migrationsDirectory);
  } finally {
    database.close();
  }
}

export function assertMigrationReady(databasePath, migrationsDirectory = MIGRATIONS_DIRECTORY) {
  const status = migrationStatus(databasePath, migrationsDirectory);
  if (!status.compatible) {
    throw new Error("The database migration state is unknown, out of order, or checksum-incompatible.");
  }
  if (!status.upToDate) {
    throw new Error(`Database schema ${status.schemaVersion} is not current (target ${status.targetSchemaVersion}).`);
  }
  return status;
}

function quoteSqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

export function createConsistentBackup(databasePath, backupPath) {
  const source = resolve(databasePath);
  const target = resolve(backupPath);
  assertOutsidePublic(source);
  assertOutsidePublic(target);
  if (source === target || existsSync(target)) {
    throw new Error("The backup destination must be a new file distinct from the database.");
  }
  if (!existsSync(source) || !statSync(source).isFile()) {
    throw new Error("The SQLite database file must exist before creating a backup.");
  }
  mkdirSync(dirname(target), { recursive: true });
  const database = new DatabaseSync(source);
  try {
    database.prepare(`VACUUM INTO ${quoteSqlString(target)}`).run();
  } finally {
    database.close();
  }
  chmodSync(target, 0o600);
  assertSQLiteIntegrity(target);
  return target;
}

function assertSQLiteIntegrity(databasePath) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const result = database.prepare("PRAGMA integrity_check").get();
    if (result?.integrity_check !== "ok") {
      throw new Error("SQLite integrity check failed.");
    }
  } finally {
    database.close();
  }
}

export function restoreBackup(backupPath, targetPath) {
  const source = resolve(backupPath);
  const target = resolve(targetPath);
  assertOutsidePublic(source);
  assertOutsidePublic(target);
  if (source === target || !existsSync(source) || existsSync(target)) {
    throw new Error("Restore requires an existing backup and a new, distinct destination.");
  }
  assertSQLiteIntegrity(source);
  const status = migrationStatus(source);
  if (!status.compatible) {
    throw new Error("The backup has an incompatible migration state.");
  }
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target, fsConstants.COPYFILE_EXCL);
  chmodSync(target, 0o600);
  assertSQLiteIntegrity(target);
  return target;
}

export function acquireDatabaseProcessLock(databasePath) {
  const lockPath = `${databasePath}.process-lock`;
  mkdirSync(dirname(lockPath), { recursive: true });
  let descriptor;
  try {
    descriptor = openSync(lockPath, "wx", 0o600);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error("A database process lock exists; confirm its owner is stopped before removing it.");
    }
    throw error;
  }
  const owner = JSON.stringify({ pid: process.pid, hostname: hostname() });
  try {
    writeFileSync(descriptor, `${owner}\n`);
  } catch (error) {
    closeSync(descriptor);
    unlinkSync(lockPath);
    throw error;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    closeSync(descriptor);
    try {
      if (readFileSync(lockPath, "utf8").trim() === owner) unlinkSync(lockPath);
    } catch {
      // The lock may already have been removed by an operator after a crash.
    }
  };
}

export function assertDatabaseWritable(databasePath) {
  if (!existsSync(databasePath)) {
    throw new Error("The production database file does not exist; initialize it with the migration command.");
  }
  const file = statSync(databasePath);
  if (!file.isFile()) throw new Error("MAYDAY_DATABASE_PATH must identify a regular file.");
  accessSync(databasePath, fsConstants.R_OK | fsConstants.W_OK);
  accessSync(dirname(databasePath), fsConstants.W_OK);
}

export function runMigrationsForCli(database, migrationsDirectory = MIGRATIONS_DIRECTORY) {
  runMigrations(database, migrationsDirectory);
}

export function existingSchemaHasAppliedMigrations(database) {
  try {
    return Number(database.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get().count) > 0;
  } catch {
    return false;
  }
}
