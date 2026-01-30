#!/usr/bin/env node
import path from "path";
import fs from "fs-extra";
import { spawn } from "child_process";
import { Command } from "commander";
import chokidar from "chokidar";
import type { LevelWithSilent } from "pino";
import { buildApps } from "@tinyverse/builder";
import { fileURLToPath } from "url";
import {
  loadConfig,
  getLogger,
  configureLogger,
  envBool,
  toolIdToFilename,
  type TinyverseConfig,
  type AppsManifest,
  type ToolManifest,
} from "@tinyverse/core";
import { extractTools } from "@tinyverse/extractor";
import { createServer, type ServerHandle } from "@tinyverse/dev-server";
import { verify } from "@tinyverse/verifier";
import { emitDiagnostics } from "./diagnostics/emitter.js";

interface GlobalOptions {
  config: string;
  out?: string;
  strict: boolean;
  json: boolean;
  verbose: boolean;
}

const defaultConfigPath = process.env.TINYVERSE_CONFIG ?? "tinyverse.config.json";
const defaultOutDir = process.env.TINYVERSE_OUT_DIR;
const defaultStrict = envBool(process.env.TINYVERSE_STRICT, false);
const defaultJson = envBool(process.env.TINYVERSE_JSON, false);
const defaultVerbose = envBool(process.env.TINYVERSE_VERBOSE, false);
const loggerLevels: LevelWithSilent[] = ["fatal", "error", "warn", "info", "debug", "trace", "silent"];
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const previewTemplateDir = path.join(repoRoot, "templates", "ui-preview");

const resolveLoggerLevel = (verbose: boolean, json: boolean): LevelWithSilent => {
  if (verbose) return "debug";
  if (json) return "silent";
  const envLevel = process.env.TINYVERSE_LOG_LEVEL as LevelWithSilent | undefined;
  return envLevel && loggerLevels.includes(envLevel) ? envLevel : "info";
};

const getGlobalOptions = (command: Command): GlobalOptions => {
  const opts = command.optsWithGlobals();
  return {
    config: opts.config ?? defaultConfigPath,
    out: opts.out ?? defaultOutDir,
    strict: Boolean(opts.strict ?? defaultStrict),
    json: Boolean(opts.json ?? defaultJson),
    verbose: Boolean(opts.verbose ?? defaultVerbose),
  };
};

const logger = getLogger();

const writeFileIfMissing = async (filePath: string, contents: string) => {
  if (await fs.pathExists(filePath)) return;
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, contents, "utf8");
};

const sanitizeResource = (toolId: string) => toolId.replace(/[^A-Za-z0-9_\-]/g, "-");

const ensurePreviewApp = async (destDir: string, toolId: string, resourceUri: string) => {
  if (!(await fs.pathExists(destDir))) {
    await fs.ensureDir(destDir);
    if (await fs.pathExists(previewTemplateDir)) {
      await fs.copy(previewTemplateDir, destDir, { overwrite: true, errorOnExist: false });
    }
  }

  const appPath = path.join(destDir, "src", "App.tsx");
  if (await fs.pathExists(appPath)) {
    const contents = await fs.readFile(appPath, "utf8");
    const newContents = contents
      .replace(/FALLBACK_TOOL_ID = "[^"]*";/, `FALLBACK_TOOL_ID = "${toolId}";`)
      .replace(/FALLBACK_RESOURCE_URI = "[^"]*";/, `FALLBACK_RESOURCE_URI = "${resourceUri}";`);

    if (contents !== newContents) {
      await fs.writeFile(appPath, newContents, "utf8");
    }
  }
};

const parseResourceUri = (uri: string): { namespace: string; resource: string } | null => {
  const match = /^ui:\/\/([A-Za-z0-9_\-]+)\/([A-Za-z0-9_\-]+)$/.exec(uri);
  return match ? { namespace: match[1], resource: match[2] } : null;
};

const isPortAccessError = (err: any) => {
  const code = err?.code;
  return code === "EADDRINUSE" || code === "EACCES" || code === "EPERM";
};

const resolveRunningPort = (server: ServerHandle | null, fallback: number) => {
  const address = (server as any)?.app?.server?.address?.();
  if (address && typeof address === "object" && "port" in address) {
    return (address as any).port ?? fallback;
  }
  return fallback;
};

const scaffoldWeatherDemo = async () => {
  await writeFileIfMissing(
    "tinyverse.config.json",
    JSON.stringify(
      {
        name: "tinyverse-sample",
        version: "0.1.0",
        toolGlobs: ["tools/**/*.ts"],
        appResources: [
          {
            toolId: "weather.getForecast",
            resourceUri: "ui://weather/forecast",
            entry: "apps/weather/forecast/ForecastCards.tsx",
          },
        ],
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
      },
      null,
      2,
    ),
  );

  await writeFileIfMissing(
    "tools/weather/forecast.ts",
    [
      'import { tool } from "@tinyverse/core";',
      "",
      "export class WeatherTools {",
      "  @tool({",
      '    id: "weather.getForecast",',
      '    name: "weather.getForecast",',
      '    description: "Get a mock forecast",',
      "    inputSchema: {",
      '      type: "object",',
      '      properties: { location: { type: "string" }, days: { type: "integer", minimum: 1 } },',
      '      required: ["location"]',
      "    },",
      "    outputSchema: {",
      '      type: "object",',
      '      properties: { forecast: { type: "array", items: { type: "string" } } },',
      "    },",
      '    resourceUri: "ui://weather/forecast"',
      "  })",
      "  async getForecast(args: { location: string; days?: number }) {",
      "    const days = args.days ?? 3;",
      "    return {",
      "      forecast: Array.from({ length: days }).map((_, i) => `${args.location}: Day ${i + 1} → Sunny with light breeze`),",
      "    };",
      "  }",
      "}",
      "",
    ].join("\n"),
  );

  await writeFileIfMissing(
    "apps/weather/forecast/ForecastCards.tsx",
    [
      'import React from "react";',
      'import { tinyverseUi } from "@tinyverse/core";',
      'import "./styles.css";',
      "",
      'const ForecastCards = ({ data, toolId }: { data: any; toolId?: string }) => {',
      '  const list = data?.result?.forecast ?? data?.forecast ?? [];',
      "  return (",
      '    <div className="forecast-grid">',
      "      {list.map((line: string, idx: number) => (",
      '        <div key={idx} className="forecast-card">',
      '          <div className="forecast-day">Day {idx + 1}</div>',
      '          <div className="forecast-text">{line}</div>',
      '          <div className="forecast-meta">Tool: {toolId}</div>',
      "          </div>",
      "      ))}",
      "    </div>",
      "  );",
      "};",
      "",
      'export default tinyverseUi({ toolId: "weather.getForecast", resourceUri: "ui://weather/forecast" })(ForecastCards);',
      "",
    ].join("\n"),
  );

  await writeFileIfMissing(
    "apps/weather/forecast/styles.css",
    [
      ".forecast-grid {",
      "  display: grid;",
      "  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));",
      "  gap: 12px;",
      "  margin-top: 10px;",
      "}",
      ".forecast-card {",
      "  border: 1px solid #e2e8f0;",
      "  border-radius: 12px;",
      "  padding: 12px;",
      "  background: linear-gradient(145deg, #f8fafc, #eef2ff);",
      "  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);",
      "}",
      ".forecast-day {",
      "  font-weight: 700;",
      "  margin-bottom: 6px;",
      "}",
      ".forecast-text {",
      "  color: #334155;",
      "}",
      ".forecast-meta {",
      "  margin-top: 8px;",
      "  font-size: 12px;",
      "  color: #475569;",
      "}",
    ].join("\n"),
  );
};

const generateServerArtifacts = async (config: TinyverseConfig, toolManifest: ToolManifest, appsManifest: AppsManifest) => {
  const generatedDir = path.resolve("server", "src", "generated");
  await fs.ensureDir(generatedDir);

  const toolManifestPath = path.join(generatedDir, "tool.manifest.json");
  const appsManifestPath = path.join(generatedDir, "apps.manifest.json");
  await fs.writeJSON(toolManifestPath, toolManifest, { spaces: 2 });
  await fs.writeJSON(appsManifestPath, appsManifest, { spaces: 2 });

  const toolRoutes = toolManifest.tools
    .map((tool) => `  { toolId: "${tool.id}", handlerPath: "../handlers/${toolIdToFilename(tool.id)}" }`)
    .join(",\n");

  const resourceRoutes = appsManifest.resources
    .map((resource) => {
      const parsed = parseResourceUri(resource.resourceUri);
      const distPath = parsed ? path.posix.join(config.distDir.replace(/\\/g, "/"), parsed.namespace, parsed.resource) : "";
      return `  { resourceUri: "${resource.resourceUri}", distPath: "${distPath}", entryFile: "${resource.entryFile}", assets: ${JSON.stringify(resource.assets)} }`;
    })
    .join(",\n");

  const routesContents = [
    "// Auto-generated Tinyverse server routes. Do not edit by hand.",
    "export type ToolRoute = { toolId: string; handlerPath: string };",
    "export type ResourceRoute = { resourceUri: string; distPath: string; entryFile: string; assets: string[] };",
    `export const toolRoutes: ToolRoute[] = [\n${toolRoutes}\n];`,
    `export const resourceRoutes: ResourceRoute[] = [\n${resourceRoutes}\n];`,
    "",
  ].join("\n");

  await fs.writeFile(path.join(generatedDir, "routes.ts"), routesContents, "utf8");
};

const openBrowserCommand = (): string | null => {
  if (process.platform === "darwin") return "open";
  if (process.platform === "win32") return "start";
  return "xdg-open";
};

const tryOpenBrowser = async (url: string, logger: ReturnType<typeof getLogger>) => {
  const cmd = openBrowserCommand();
  if (!cmd) {
    logger.warn({ url }, "No browser opener available for this platform");
    return;
  }
  await new Promise<void>((resolve) => {
    const child = spawn(cmd, [url], { stdio: "ignore", shell: process.platform === "win32" });
    child.on("error", (err) => {
      logger.warn({ err, url }, "Failed to launch browser");
      resolve();
    });
    child.on("exit", () => resolve());
  });
};

const generateHandlerStubs = async (tools: { id: string }[]) => {
  for (const tool of tools) {
    const filename = path.resolve("server", "src", "handlers", `${toolIdToFilename(tool.id)}.ts`);
    if (await fs.pathExists(filename)) continue;
    await fs.ensureDir(path.dirname(filename));
    const contents = [
      "// Auto-generated stub for Tinyverse dev server",
      "export const handler = async (input: any) => {",
      `  return { message: "NotImplemented", toolId: "${tool.id}", input };`,
      "};",
      "",
    ].join("\n");
    await fs.writeFile(filename, contents, "utf8");
  }
};

const loadCliConfig = async (options: GlobalOptions): Promise<TinyverseConfig> => {
  return loadConfig(options.config, { outDir: options.out });
};

const program = new Command();
program.name("tinyverse").description("Tinyverse CLI").version("0.1.0");
program.enablePositionalOptions();
program
  .option("--config <path>", "Path to config file", defaultConfigPath)
  .option("--out <path>", "Override outDir (or set TINYVERSE_OUT_DIR)", defaultOutDir)
  .option("--strict", "Treat warnings as errors", defaultStrict)
  .option("--json", "Emit diagnostics as JSON", defaultJson)
  .option("--verbose", "Enable verbose logging", defaultVerbose);

program.hook("preAction", (thisCommand) => {
  const globals = getGlobalOptions(thisCommand);
  configureLogger({ level: resolveLoggerLevel(globals.verbose, globals.json) });
  if (globals.out) {
    process.env.TINYVERSE_OUT_DIR = globals.out;
  }
});

program
  .command("init")
  .description("Scaffold weather demo (tools + UI + config)")
  .action(async () => {
    await scaffoldWeatherDemo();
    logger.info("Initialized Tinyverse weather demo");
  });

program
  .command("extract")
  .description("Extract tool manifest from decorated tools")
  .action(async (_opts, command) => {
    const globals = getGlobalOptions(command);
    const config = await loadCliConfig(globals);
    const result = await extractTools(config, { strict: globals.strict });
    if (globals.json || result.diagnostics.length > 0) {
      emitDiagnostics({
        command: "extract",
        diagnostics: result.diagnostics,
        success: result.success,
        json: globals.json,
        logger,
        context: { manifestPath: path.join(config.outDir, "tool.manifest.json") },
      });
    }
    if (!result.success) {
      process.exitCode = 1;
    }
  });

program
  .command("build")
  .description("Build app resources and write apps manifest")
  .action(async (_opts, command) => {
    const globals = getGlobalOptions(command);
    const config = await loadCliConfig(globals);
    const result = await buildApps(config, { strict: globals.strict });
    if (globals.json || result.diagnostics.length > 0) {
      emitDiagnostics({
        command: "build",
        diagnostics: result.diagnostics,
        success: result.success,
        json: globals.json,
        logger,
        context: { manifestPath: path.join(config.outDir, "apps.manifest.json") },
      });
    }
    if (!result.success) {
      process.exitCode = 1;
    }
  });

program
  .command("dev")
  .description("Watch tools/apps, rebuild, and run dev server")
  .action(async (_opts, command) => {
    const globals = getGlobalOptions(command);
    const initialConfig = await loadCliConfig(globals);
    let server: ServerHandle | null = null;
    let running = false;
    let queued = false;
    let browserOpened = false;

    const restart = async () => {
      if (running) {
        queued = true;
        return;
      }
      running = true;
      const config = await loadCliConfig(globals);
      const extractResult = await extractTools(config, { strict: globals.strict });
      const buildResult = await buildApps(config, { strict: globals.strict });
      await generateHandlerStubs(extractResult.manifest.tools);

      const diagnostics = [...extractResult.diagnostics, ...buildResult.diagnostics];
      const success = extractResult.success && buildResult.success;

      if (globals.json || diagnostics.length > 0) {
        emitDiagnostics({
          command: "dev",
          diagnostics,
          success,
          json: globals.json,
          logger,
          context: {
            toolManifestPath: path.join(config.outDir, "tool.manifest.json"),
            appsManifestPath: path.join(config.outDir, "apps.manifest.json"),
            server: { host: config.server.host, port: config.server.port },
          },
        });
      }

      if (success) {
        if (server) {
          await server.stop();
        }
        await generateServerArtifacts(config, extractResult.manifest, buildResult.manifest);
        const startServer = async (port: number) => {
          const handle = await createServer({
            outDir: config.outDir,
            distDir: config.distDir,
            host: config.server.host,
            port,
          });
          await handle.start();
          return handle;
        };

        let startError: any = null;
        try {
          server = await startServer(config.server.port);
        } catch (err) {
          startError = err;
          if (isPortAccessError(err) && config.server.port !== 0) {
            if (!globals.json) {
              logger.warn(
                { host: config.server.host, port: config.server.port, err },
                "Port unavailable; retrying on a random port",
              );
            }
            try {
              server = await startServer(0);
            } catch (retryErr) {
              startError = retryErr;
            }
          }
        }

        if (!server) {
          if (!globals.json) {
            logger.error({ err: startError }, "Dev server failed to start");
          }
          running = false;
          if (queued) {
            queued = false;
            restart();
          }
          return;
        }

        const runningPort = resolveRunningPort(server, config.server.port);
        if (!globals.json) {
          logger.info({ host: config.server.host, port: runningPort }, "Dev server running");
        }
        if (config.server.openBrowser && config.appResources.length > 0 && !browserOpened) {
          const parsed = parseResourceUri(config.appResources[0].resourceUri);
          if (parsed) {
            const url = `http://${config.server.host}:${runningPort}/ui/${parsed.namespace}/${parsed.resource}`;
            await tryOpenBrowser(url, logger);
            browserOpened = true;
          }
        }
      } else {
        if (!globals.json) {
          logger.error("Skipping server restart due to diagnostics");
        }
      }
      running = false;
      if (queued) {
        queued = false;
        restart();
      }
    };

    await restart();

    const watchPaths = [
      ...initialConfig.toolGlobs,
      ...initialConfig.appResources.map((r) => r.entry),
      globals.config ?? defaultConfigPath,
    ];
    const watcher = chokidar.watch(watchPaths, { ignoreInitial: true });
    watcher.on("all", (event, path) => {
      if (!globals.json) {
        logger.debug({ event, path }, "Watch event triggered restart");
      }
      restart();
    });

    const shutdown = async () => {
      await watcher.close();
      if (server) await server.stop();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });

program
  .command("preview")
  .description("Generate a preview UI for a tool and run the dev server")
  .requiredOption("--tool <id>", "Tool ID to preview")
  .option("--resource <uri>", "Resource URI to use (default ui://preview/<tool>)")
  .option("--entry <path>", "Entry file for the preview UI (default .tinyverse/preview-ui/main.tsx)")
  .option("--openai-key <key>", "OpenAI API Key for the preview planner")
  .option("--open", "Open browser when ready")
  .action(async (opts, command) => {
    const globals = getGlobalOptions(command);
    if (opts.openaiKey) {
      process.env.OPENAI_API_KEY = opts.openaiKey as string;
    }
    const toolId = opts.tool as string;
    const shellResourceUri = "ui://tinyverse/preview";
    const previewDir = path.resolve(".tinyverse", "preview-ui");
    const shellEntry = path.resolve(opts.entry ?? path.join(previewDir, "main.tsx"));

    // Resolve target resource URI and scaffold preview app once.
    const initialBase = await loadCliConfig(globals);
    const existing = initialBase.appResources.find((r) => r.toolId === toolId);
    const targetResourceUri =
      (opts.resource as string | undefined) ??
      existing?.resourceUri ??
      `ui://preview/${sanitizeResource(toolId) || "resource"}`;

    await ensurePreviewApp(previewDir, toolId, targetResourceUri);

    const buildPreviewConfig = async (): Promise<TinyverseConfig> => {
      const base = await loadCliConfig(globals);
      const previewOut = path.resolve(base.outDir, "preview");
      const previewDist = path.resolve(base.distDir, "preview");

      return {
        ...base,
        name: `${base.name}-preview`,
        appResources: [
          ...base.appResources,
          { toolId: "_tinyverse.preview", resourceUri: shellResourceUri, entry: shellEntry },
        ],
        outDir: previewOut,
        distDir: previewDist,
        server: { ...base.server, openBrowser: Boolean(opts.open ?? base.server.openBrowser) },
      };
    };

    let server: ServerHandle | null = null;
    let running = false;
    let queued = false;
    let browserOpened = false;

    const restart = async () => {
      if (running) {
        queued = true;
        return;
      }
      running = true;
      const config = await buildPreviewConfig();
      const extractResult = await extractTools(config, { strict: globals.strict });
      const buildResult = await buildApps(config, { strict: globals.strict });
      await generateHandlerStubs(extractResult.manifest.tools);

      const diagnostics = [...extractResult.diagnostics, ...buildResult.diagnostics];
      const success = extractResult.success && buildResult.success;

      if (globals.json || diagnostics.length > 0) {
        emitDiagnostics({
          command: "preview",
          diagnostics,
          success,
          json: globals.json,
          logger,
          context: {
            toolManifestPath: path.join(config.outDir, "tool.manifest.json"),
            appsManifestPath: path.join(config.outDir, "apps.manifest.json"),
            server: { host: config.server.host, port: config.server.port },
          },
        });
      }

      if (success) {
        if (server) {
          await server.stop();
        }
        await generateServerArtifacts(config, extractResult.manifest, buildResult.manifest);

        const startServer = async (port: number) => {
          const handle = await createServer({
            outDir: config.outDir,
            distDir: config.distDir,
            host: config.server.host,
            port,
          });
          await handle.start();
          return handle;
        };

        let startError: any = null;
        try {
          server = await startServer(config.server.port);
        } catch (err) {
          startError = err;
          if (isPortAccessError(err) && config.server.port !== 0) {
            if (!globals.json) {
              logger.warn(
                { host: config.server.host, port: config.server.port, err },
                "Port unavailable; retrying on a random port",
              );
            }
            try {
              server = await startServer(0);
            } catch (retryErr) {
              startError = retryErr;
            }
          }
        }

        if (!server) {
          if (!globals.json) {
            logger.error({ err: startError }, "Dev server failed to start");
          }
          running = false;
          if (queued) {
            queued = false;
            restart();
          }
          return;
        }

        const runningPort = resolveRunningPort(server, config.server.port);
        if (!globals.json) {
          logger.info({ host: config.server.host, port: runningPort }, "Preview server running");
        }
        if (config.server.openBrowser && !browserOpened) {
          const parsed = parseResourceUri(shellResourceUri);
          if (parsed) {
            const url = `http://${config.server.host}:${runningPort}/ui/${parsed.namespace}/${parsed.resource}`;
            await tryOpenBrowser(url, logger);
            browserOpened = true;
          }
        }
      } else if (!globals.json) {
        logger.error("Skipping server restart due to diagnostics");
      }

      running = false;
      if (queued) {
        queued = false;
        restart();
      }
    };

    await restart();

    const configForWatch = await buildPreviewConfig();
    const watchPaths = [
      ...configForWatch.toolGlobs,
      ...configForWatch.appResources.map((r) => r.entry),
      globals.config ?? defaultConfigPath,
    ];
    const watcher = chokidar.watch(watchPaths, { ignoreInitial: true });
    watcher.on("all", (event, path) => {
      if (!globals.json) {
        logger.debug({ event, path }, "Watch event triggered restart");
      }
      restart();
    });

    const shutdown = async () => {
      await watcher.close();
      if (server) await server.stop();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });

program
  .command("verify")
  .description("Run static + live checks against running server")
  .action(async (_opts, command) => {
    const globals = getGlobalOptions(command);
    const config = await loadCliConfig(globals);
    const result = await verify(config, { strict: globals.strict });
    if (globals.json || result.diagnostics.length > 0) {
      emitDiagnostics({
        command: "verify",
        diagnostics: result.diagnostics,
        success: result.success,
        json: globals.json,
        logger,
        context: { reportPath: path.join(config.outDir, "verify-report.json") },
      });
    }
    if (!result.success) {
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);
