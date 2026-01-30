#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const cliDist = path.join(repoRoot, "packages", "cli", "dist", "index.js");

if (fs.existsSync(cliDist)) {
  process.exit(0);
}

const result = spawnSync("npm", ["run", "build"], {
  cwd: repoRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
