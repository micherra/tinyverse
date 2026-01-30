import fs from "fs-extra";
import path from "path";
import { configSchema } from "./schema.js";
import { envBool } from "./env.js";
import type { TinyverseConfig } from "../types.js";

export interface LoadConfigOptions {
  outDir?: string;
}

export const loadConfig = async (
  configPath = "tinyverse.config.json",
  options: LoadConfigOptions = {},
): Promise<TinyverseConfig> => {
  const resolved = path.resolve(configPath);
  if (!(await fs.pathExists(resolved))) {
    throw new Error(`Config not found at ${resolved}`);
  }

  const raw = await fs.readJSON(resolved);
  const parsed = configSchema.parse(raw);

  const outDir = options.outDir ?? process.env.TINYVERSE_OUT_DIR ?? parsed.outDir;

  return {
    ...parsed,
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
