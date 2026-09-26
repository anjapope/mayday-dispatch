import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const standaloneRoot = resolve(projectRoot, ".next", "standalone");
if (!existsSync(join(standaloneRoot, "server.js"))) {
  throw new Error("Next.js standalone output is missing; run the production build first.");
}

function copyDirectory(source, destination) {
  if (!existsSync(source)) return;
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true });
}

copyDirectory(
  resolve(projectRoot, ".next", "static"),
  join(standaloneRoot, ".next", "static"),
);
copyDirectory(resolve(projectRoot, "public"), join(standaloneRoot, "public"));
copyDirectory(
  resolve(projectRoot, "src", "persistence", "migrations"),
  join(standaloneRoot, "src", "persistence", "migrations"),
);
copyDirectory(
  resolve(projectRoot, "src", "persistence", "migration-engine.mjs"),
  join(standaloneRoot, "src", "persistence", "migration-engine.mjs"),
);
