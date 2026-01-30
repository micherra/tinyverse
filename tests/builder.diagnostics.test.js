import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { buildApps } from "@tinyverse/builder";

const tempDirs = [];

const makeTempDir = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tinyverse-builder-"));
  tempDirs.push(dir);
  return dir;
};

const baseConfig = (root) => ({
  name: "test",
  version: "0.0.0",
  toolGlobs: [],
  appResources: [],
  tsconfig: path.join(root, "tsconfig.json"),
  outDir: path.join(root, ".tinyverse"),
  distDir: path.join(root, "dist"),
  server: { host: "127.0.0.1", port: 8787, openBrowser: false },
  bundler: { type: "vite", framework: "react", base: "/", assetsInlineLimit: 4096 },
});

const writeToolManifest = async (root, tools) => {
  const manifestPath = path.join(root, ".tinyverse", "tool.manifest.json");
  await fs.ensureDir(path.dirname(manifestPath));
  await fs.writeJSON(
    manifestPath,
    {
      manifest_version: "tinyverse.tool.v0.1",
      name: "test",
      version: "0.0.0",
      generated_by: "test",
      generated_at: new Date().toISOString(),
      tools,
    },
    { spaces: 2 },
  );
  return manifestPath;
};

const writeTsConfig = async (root) => {
  const tsconfigPath = path.join(root, "tsconfig.json");
  await fs.writeJSON(tsconfigPath, {
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      esModuleInterop: true,
    },
    include: [],
  });
  return tsconfigPath;
};

after(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

test("builder flags mismatched tool/resource mapping", async () => {
  const root = await makeTempDir();
  const config = baseConfig(root);
  await writeTsConfig(root);

  await writeToolManifest(root, [
    { id: "tool.one", name: "Tool One", inputSchema: {}, resourceUri: "ui://demo/alpha" },
  ]);

  const entryDir = path.join(root, "apps", "demo", "beta");
  const entryFile = path.join(entryDir, "main.tsx");
  await fs.ensureDir(entryDir);
  const entrySource = `
    import React from "react";
    import { createRoot } from "react-dom/client";
    const root = document.getElementById("root");
    if (root) {
      createRoot(root).render(React.createElement("div", null, "ok"));
    }
  `;
  await fs.writeFile(entryFile, entrySource, "utf8");

  config.appResources = [{ resourceUri: "ui://demo/beta", toolId: "tool.one", entry: entryFile }];

  const result = await buildApps(config, { strict: true });

  assert.equal(result.success, false);
  const codes = result.diagnostics.map((d) => d.code);
  assert.ok(codes.includes("TV_DIAG_TOOL_UI_MISMATCH"));
  assert.ok(codes.includes("TV_DIAG_UI_URI_MISSING_IN_APPS_MANIFEST"));
});

test("builder reports missing entry file", async () => {
  const root = await makeTempDir();
  const config = baseConfig(root);
  await writeTsConfig(root);

  await writeToolManifest(root, [
    { id: "tool.two", name: "Tool Two", inputSchema: {}, resourceUri: "ui://demo/gamma" },
  ]);

  const missingEntry = path.join(root, "apps", "demo", "gamma", "main.tsx");
  config.appResources = [{ resourceUri: "ui://demo/gamma", toolId: "tool.two", entry: missingEntry }];

  const result = await buildApps(config, { strict: true });

  assert.equal(result.success, false);
  assert.ok(result.diagnostics.some((d) => d.code === "TV_DIAG_BUILD_ENTRYFILE_MISSING"));
});
