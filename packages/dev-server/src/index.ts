import path from "path";
import fs from "fs-extra";
import Fastify, { FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import { pathToFileURL } from "url";
import { AppsManifest, ToolManifest } from "@tinyverse/core";
import { getLogger, toolIdToFilename } from "@tinyverse/core";

export interface ServerOptions {
  outDir: string;
  distDir: string;
  host: string;
  port: number;
}

export interface ServerHandle {
  app: FastifyInstance;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

const logger = getLogger();

const loadManifest = async <T>(filePath: string): Promise<T | null> => {
  if (!(await fs.pathExists(filePath))) return null;
  return fs.readJSON(filePath);
};

const resolveHandlerPath = async (toolId: string): Promise<string | null> => {
  const base = path.resolve("server", "src", "handlers", toolIdToFilename(toolId));
  const candidates = [`${base}.ts`, `${base}.js`];
  for (const candidate of candidates) {
    if (await fs.pathExists(candidate)) return candidate;
  }
  return null;
};

const registerResourceRoutes = async (app: FastifyInstance, manifest: AppsManifest, distDir: string) => {
  for (const resource of manifest.resources) {
    const match = /^ui:\/\/([A-Za-z0-9_\-]+)\/([A-Za-z0-9_\-]+)$/.exec(resource.resourceUri);
    if (!match) continue;
    const ns = match[1];
    const res = match[2];
    const prefix = `/ui/${ns}/${res}/`;
    const resourceRoot = path.resolve(distDir, ns, res);
    if (!(await fs.pathExists(resourceRoot))) {
      logger.warn({ resourceRoot }, "Skipping resource route; dist path missing");
      continue;
    }
    app.register(fastifyStatic, {
      root: resourceRoot,
      prefix,
      decorateReply: false,
    });
    app.get(`/ui/${ns}/${res}`, async (_req, reply) => {
      const indexPath = path.join(resourceRoot, "index.html");
      if (!(await fs.pathExists(indexPath))) {
        reply.code(404).send({ error: "Not Found" });
        return;
      }
      return reply.type("text/html").send(await fs.readFile(indexPath));
    });
  }
};

export const createServer = async (options: ServerOptions): Promise<ServerHandle> => {
  const toolManifest =
    (await loadManifest<ToolManifest>(path.join(options.outDir, "tool.manifest.json"))) ?? {
      manifest_version: "tinyverse.tool.v0.1",
      name: "tinyverse",
      version: "0.0.0",
      generated_by: "dev-server",
      generated_at: new Date().toISOString(),
      tools: [],
    };
  const appsManifest =
    (await loadManifest<AppsManifest>(path.join(options.outDir, "apps.manifest.json"))) ?? {
      manifest_version: "tinyverse.apps.v0.1",
      name: "tinyverse",
      version: "0.0.0",
      generated_by: "dev-server",
      generated_at: new Date().toISOString(),
      outDir: options.distDir,
      resources: [],
    };

  const app = Fastify({ logger: false });
  await app.register(fastifyCors, { origin: true });

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/tools", async () => toolManifest.tools ?? []);

  app.post<{ Params: { toolId: string }; Body: unknown }>("/tools/:toolId", async (request, reply) => {
    const toolId = request.params.toolId;
    const handlerPath = await resolveHandlerPath(toolId);
    if (!handlerPath) {
      reply.code(501);
      return { error: `Handler for ${toolId} not implemented` };
    }
    try {
      const module = await import(pathToFileURL(handlerPath).href);
      const handler = module.handler as (input: unknown) => unknown;
      const result = await handler(request.body ?? {});
      return { result };
    } catch (err) {
      reply.code(500);
      return { error: `Handler error for ${toolId}: ${String(err)}` };
    }
  });

  await registerResourceRoutes(app, appsManifest, options.distDir);

  return {
    app,
    start: async () => {
      await app.listen({ port: options.port, host: options.host });
      logger.info({ port: options.port, host: options.host }, "Dev server started");
    },
    stop: async () => {
      try {
        await app.close();
      } catch (err) {
        logger.warn({ err }, "Error closing dev server");
      }
    },
  };
};
