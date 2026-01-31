import fs from "fs-extra";
import path from "path";
import { configSchema } from "./schema.js";
import { envBool } from "./env.js";
import type { TinyverseConfig } from "../types.js";

export interface LoadConfigOptions {
  outDir?: string;
  toolGlobs?: string[];
}

export const loadConfig = async (
  configPath = "tinyverse.config.json",
  options: LoadConfigOptions = {},
): Promise<TinyverseConfig> => {
  const resolved = path.resolve(configPath);
  let raw: any;

  if (await fs.pathExists(resolved)) {
    raw = await fs.readJSON(resolved);
  } else if (options.toolGlobs && options.toolGlobs.length > 0) {
    raw = {
      name: "tinyverse-adhoc",
      version: "0.1.0",
      toolGlobs: options.toolGlobs,
      appResources: [],
      tsconfig: "tsconfig.json",
      outDir: ".tinyverse",
      distDir: "dist",
      server: {
        host: "127.0.0.1",
        port: 8787,
        openBrowser: false,
      },
      bundler: {
        type: "vite",
        framework: "react",
        base: "/",
        assetsInlineLimit: 4096,
      },
    };
  } else {
    throw new Error(`Config not found at ${resolved}. Provide a config file or use --tools to specify tool sources.`);
  }

  const parsed = configSchema.parse(raw);

  const outDir = options.outDir ?? process.env.TINYVERSE_OUT_DIR ?? parsed.outDir;
  const toolGlobs = options.toolGlobs ?? parsed.toolGlobs;

  return {
    ...parsed,
    toolGlobs,
    outDir,
    distDir: process.env.TINYVERSE_DIST_DIR ?? parsed.distDir,
    server: {
      host: process.env.TINYVERSE_SERVER_HOST ?? parsed.server.host,
      port: process.env.TINYVERSE_SERVER_PORT ? Number(process.env.TINYVERSE_SERVER_PORT) : parsed.server.port,
      openBrowser: envBool(process.env.TINYVERSE_OPEN_BROWSER, parsed.server.openBrowser),
    },
    bundler: {
      ...parsed.bundler,
      base: process.env.TINYVERSE_BASE ?? parsed.bundler.base,
      assetsInlineLimit: process.env.TINYVERSE_ASSETS_INLINE_LIMIT
        ? Number(process.env.TINYVERSE_ASSETS_INLINE_LIMIT)
        : parsed.bundler.assetsInlineLimit,
    },
  };
};
