import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { extractTools } from "@tinyverse/extractor";

const tempDirs = [];

const makeTempDir = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tinyverse-extractor-"));
  tempDirs.push(dir);
  return dir;
};

const writeTsConfig = async (root, include) => {
  const tsconfigPath = path.join(root, "tsconfig.json");
  await fs.writeJSON(tsconfigPath, {
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      experimentalDecorators: true,
      strict: true,
      esModuleInterop: true,
    },
    include,
  });
  return tsconfigPath;
};

const baseConfig = (root, tsconfigPath) => ({
  name: "test",
  version: "0.0.0",
  toolGlobs: [path.join(root, "tools/**/*.ts")],
  appResources: [],
  tsconfig: tsconfigPath,
  outDir: path.join(root, ".tinyverse"),
  distDir: path.join(root, "dist"),
  server: { host: "127.0.0.1", port: 8787, openBrowser: false },
  bundler: { type: "vite", framework: "react", base: "/", assetsInlineLimit: 4096 },
});

after(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

test("extractor warns when a tool omits resourceUri", async () => {
  const root = await makeTempDir();
  const toolsDir = path.join(root, "tools");
  await fs.ensureDir(toolsDir);
  const tsconfigPath = await writeTsConfig(root, ["tools/**/*.ts"]);

  const source = `
    import { tool } from "@tinyverse/core";

    export class WeatherTool {
      @tool({ id: "weather.getForecast", inputSchema: { type: "object", properties: {} } })
      run(input: { city: string }) {
        return { city: input.city };
      }
    }
  `;
  await fs.writeFile(path.join(toolsDir, "weather.ts"), source, "utf8");

  const result = await extractTools(baseConfig(root, tsconfigPath), { strict: true });

  assert.equal(result.success, false);
  assert.ok(result.diagnostics.some((d) => d.code === "TV_DIAG_UI_URI_MISSING" && d.severity === "warning"));
});

test("extractor fails on duplicate tool ids", async () => {
  const root = await makeTempDir();
  const toolsDir = path.join(root, "tools");
  await fs.ensureDir(toolsDir);
  const tsconfigPath = await writeTsConfig(root, ["tools/**/*.ts"]);

  const source = `
    import { tool } from "@tinyverse/core";

    export class First {
      @tool({ id: "dup.tool", inputSchema: { type: "object", properties: {} }, resourceUri: "ui://demo/one" })
      run() {
        return { ok: true };
      }
    }

    export class Second {
      @tool({ id: "dup.tool", inputSchema: { type: "object", properties: {} }, resourceUri: "ui://demo/two" })
      run() {
        return { ok: true };
      }
    }
  `;
  await fs.writeFile(path.join(toolsDir, "dupe.ts"), source, "utf8");

  const result = await extractTools(baseConfig(root, tsconfigPath), { strict: true });

  assert.equal(result.success, false);
  assert.ok(result.diagnostics.some((d) => d.code === "TV_DIAG_TOOL_ID_DUPLICATE"));
});
