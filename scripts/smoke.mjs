import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { loadConfig } from "@tinyverse/core";
import { extractTools } from "@tinyverse/extractor";
import { buildApps } from "@tinyverse/builder";
import { createServer } from "@tinyverse/dev-server";
import { verify } from "@tinyverse/verifier";
import { Response } from "undici";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const createInjectFetch = (app) => async (url, options = {}) => {
  const target = new URL(url);
  const response = await app.inject({
    method: options.method ?? "GET",
    url: `${target.pathname}${target.search}`,
    payload: options.body,
    headers: options.headers,
  });
  const body = response.rawPayload ?? response.payload ?? "";
  return new Response(body, {
    status: response.statusCode,
    headers: response.headers,
  });
};

const run = async () => {
  const projectRoot =
    process.env.TINYVERSE_DEMO_ROOT ?? path.join(__dirname, "..", "examples", "weather-app");
  const configPath =
    process.env.TINYVERSE_CONFIG ?? path.join(projectRoot, "tinyverse.config.json");

  process.chdir(projectRoot);

  const config = await loadConfig(configPath);

  await fs.rm(config.outDir, { recursive: true, force: true });
  await fs.rm(config.distDir, { recursive: true, force: true });

  const extractResult = await extractTools(config, { strict: true });
  if (!extractResult.success) {
    throw new Error("extract failed");
  }

  const buildResult = await buildApps(config, { strict: true });
  if (!buildResult.success) {
    throw new Error("build failed");
  }

  const server = await createServer({
    outDir: config.outDir,
    distDir: config.distDir,
    host: config.server.host,
    port: config.server.port,
  });

  let serverStarted = false;
  let fetchImpl = undefined;
  let baseUrl = `http://${config.server.host}:${config.server.port}`;

  try {
    await server.start();
    serverStarted = true;
  } catch (err) {
    const code = err?.code;
    if (code === "EACCES" || code === "EADDRINUSE" || code === "EPERM") {
      console.warn(
        `Dev server could not bind to ${config.server.host}:${config.server.port} (code: ${code}); using in-memory Fastify inject for verify`,
      );
      await server.app.ready();
      fetchImpl = createInjectFetch(server.app);
      baseUrl = "http://fastify.internal";
    } else {
      throw err;
    }
  }

  let verifyResult;
  try {
    verifyResult = await verify(config, { strict: true, headless: false, fetchImpl, baseUrl });
  } finally {
    if (serverStarted) {
      await server.stop();
    } else {
      try {
        await server.app.close();
      } catch (err) {
        console.warn("Error closing server after fallback verify", err);
      }
    }
  }

  if (!verifyResult.success) {
    throw new Error("verify failed");
  }

  const toolManifestPath = path.join(config.outDir, "tool.manifest.json");
  const appsManifestPath = path.join(config.outDir, "apps.manifest.json");
  const reportPath = path.join(config.outDir, "verify-report.json");

  console.log(
    JSON.stringify(
      {
        status: "ok",
        toolManifestPath,
        appsManifestPath,
        reportPath,
      },
      null,
      2,
    ),
  );
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
