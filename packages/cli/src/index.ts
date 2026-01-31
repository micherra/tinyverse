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
  tools?: string[];
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
    tools: opts.tools,
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

const ensurePreviewApp = async (
  destDir: string,
  toolId: string,
  resourceUri: string,
  templateHint?: string,
) => {
  if (!(await fs.pathExists(destDir))) {
    await fs.ensureDir(destDir);
    let templateToUse: string | undefined;

    if (templateHint) {
      const customHinted = path.resolve(".tinyverse", "templates", templateHint);
      if (await fs.pathExists(customHinted)) {
        templateToUse = customHinted;
      } else {
        const globalHinted = path.join(repoRoot, "templates", templateHint);
        if (await fs.pathExists(globalHinted)) {
          templateToUse = globalHinted;
        }
      }
    }

    if (!templateToUse) {
      const customDefault = path.resolve(".tinyverse", "templates", "ui-preview");
      templateToUse = (await fs.pathExists(customDefault)) ? customDefault : previewTemplateDir;
    }

    if (templateToUse && (await fs.pathExists(templateToUse))) {
      await fs.copy(templateToUse, destDir, { overwrite: true, errorOnExist: false });
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

const isPortAccessError = (err: unknown) => {
  const code = (err as { code?: string })?.code;
  return code === "EADDRINUSE" || code === "EACCES" || code === "EPERM";
};

const resolveRunningPort = (server: ServerHandle | null, fallback: number) => {
  const address = server?.app.server.address();
  if (address && typeof address === "object" && "port" in address) {
    return address.port;
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
          openBrowser: true,
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
      '    description: "Get a real forecast using Open-Meteo",',
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
      "    const location = args.location?.trim() || \"San Francisco\";",
      "    const days = Math.min(Math.max(args.days ?? 3, 1), 7);",
      "",
      '    const geocodeUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");',
      '    geocodeUrl.searchParams.set("name", location);',
      '    geocodeUrl.searchParams.set("count", "1");',
      "",
      "    const geoRes = await fetch(geocodeUrl);",
      "    if (!geoRes.ok) throw new Error(`Geocoding failed: ${geoRes.status}`);",
      "    const geoJson = (await geoRes.json()) as { results?: { latitude: number; longitude: number; name: string }[] };",
      "    const first = geoJson?.results?.[0];",
      "    if (!first) throw new Error(`Location not found: ${location}`);",
      "",
      "    const { latitude, longitude, name: resolvedName } = first;",
      "",
      '    const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");',
      '    forecastUrl.searchParams.set("latitude", String(latitude));',
      '    forecastUrl.searchParams.set("longitude", String(longitude));',
      '    forecastUrl.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_probability_max");',
      '    forecastUrl.searchParams.set("forecast_days", String(days));',
      '    forecastUrl.searchParams.set("timezone", "auto");',
      "",
      "    const forecastRes = await fetch(forecastUrl);",
      "    if (!forecastRes.ok) throw new Error(`Forecast request failed: ${forecastRes.status}`);",
      "    const forecastJson = (await forecastRes.json()) as { daily?: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[] } };",
      "",
      "    const dates = forecastJson?.daily?.time ?? [];",
      "    const highs = forecastJson?.daily?.temperature_2m_max ?? [];",
      "    const lows = forecastJson?.daily?.temperature_2m_min ?? [];",
      "    const precip = forecastJson?.daily?.precipitation_probability_max ?? [];",
      "",
      "    const forecast = dates.slice(0, days).map((date: string, idx: number) => {",
      '      const high = highs[idx] ?? "–";',
      '      const low = lows[idx] ?? "–";',
      '      const rain = precip[idx] ?? "–";',
      "      return `${resolvedName}: ${date} → High ${high}°C / Low ${low}°C · Rain chance ${rain}%`;",
      "    });",
      "",
      "    return { forecast };",
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
      'const ForecastCards = ({ data, toolId }: { data: { forecast?: string[] }; toolId?: string }) => {',
      '  const list = (data as any)?.result?.forecast ?? data?.forecast ?? [];',
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

    let contents: string;
    if (tool.id === "weather.getForecast") {
      contents = [
        "// Real implementation for weather.getForecast",
        "export const handler = async (input: unknown) => {",
        "  const args = input as { location?: string; days?: number };",
        '  const location = args?.location?.trim?.() || "San Francisco";',
        "  const days = Math.min(Math.max(args?.days ?? 3, 1), 7);",
        "",
        '  const geocodeUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");',
        '  geocodeUrl.searchParams.set("name", location);',
        '  geocodeUrl.searchParams.set("count", "1");',
        "",
        "  const geoRes = await fetch(geocodeUrl);",
        "  if (!geoRes.ok) return { error: `Geocoding failed: ${geoRes.status}` };",
        "  const geoJson = (await geoRes.json()) as { results?: { latitude: number; longitude: number; name?: string }[] };",
        "  const first = geoJson?.results?.[0];",
        "  if (!first) return { error: `Location not found: ${location}` };",
        "",
        "  const latitude = first.latitude;",
        "  const longitude = first.longitude;",
        "  const resolvedName = first.name ?? location;",
        "",
        '  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");',
        '  forecastUrl.searchParams.set("latitude", String(latitude));',
        '  forecastUrl.searchParams.set("longitude", String(longitude));',
        '  forecastUrl.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_probability_max");',
        '  forecastUrl.searchParams.set("forecast_days", String(days));',
        '  forecastUrl.searchParams.set("timezone", "auto");',
        "",
        "  const forecastRes = await fetch(forecastUrl);",
        "  if (!forecastRes.ok) return { error: `Forecast request failed: ${forecastRes.status}` };",
        "  const forecastJson = (await forecastRes.json()) as { daily?: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[] } };",
        "  const dates: string[] = forecastJson?.daily?.time ?? [];",
        "  const highs: number[] = forecastJson?.daily?.temperature_2m_max ?? [];",
        "  const lows: number[] = forecastJson?.daily?.temperature_2m_min ?? [];",
        "  const precip: number[] = forecastJson?.daily?.precipitation_probability_max ?? [];",
        "",
        "  const forecast = dates.slice(0, days).map((date, idx) => {",
        '    const high = highs[idx] ?? "–";',
        '    const low = lows[idx] ?? "–";',
        '    const rain = precip[idx] ?? "–";',
        "    return `${resolvedName}: ${date} → High ${high}°C / Low ${low}°C · Rain chance ${rain}%`;",
        "  });",
        "",
        "  return { forecast };",
        "};",
        "",
      ].join("\n");
    } else {
      contents = [
        "// Auto-generated stub for Tinyverse dev server",
        "export const handler = async (input: unknown) => {",
        `  return { message: "NotImplemented", toolId: "${tool.id}", input };`,
        "};",
        "",
      ].join("\n");
    }
    await fs.writeFile(filename, contents, "utf8");
  }
};

const loadCliConfig = async (options: GlobalOptions): Promise<TinyverseConfig> => {
  return loadConfig(options.config, { outDir: options.out, toolGlobs: options.tools });
};

class DevRunner {
  private server: ServerHandle | null = null;
  private running = false;
  private queued = false;
  private browserOpened = false;

  constructor(
    private commandName: "dev" | "preview",
    private globals: GlobalOptions,
    private configFactory: () => Promise<TinyverseConfig>,
    private options: { open?: boolean; openResourceUri?: string } = {},
  ) {}

  async restart() {
    if (this.running) {
      this.queued = true;
      return;
    }
    this.running = true;

    try {
      const config = await this.configFactory();
      if (this.options.open) {
        config.server.openBrowser = true;
      }

      const extractResult = await extractTools(config, { strict: this.globals.strict });
      const buildResult = await buildApps(config, { strict: this.globals.strict });
      await generateHandlerStubs(extractResult.manifest.tools);

      const diagnostics = [...extractResult.diagnostics, ...buildResult.diagnostics];
      const success = extractResult.success && buildResult.success;

      if (this.globals.json || diagnostics.length > 0) {
        emitDiagnostics({
          command: this.commandName,
          diagnostics,
          success,
          json: this.globals.json,
          logger,
          context: {
            toolManifestPath: path.join(config.outDir, "tool.manifest.json"),
            appsManifestPath: path.join(config.outDir, "apps.manifest.json"),
            server: { host: config.server.host, port: config.server.port },
          },
        });
      }

      if (success) {
        if (this.server) {
          await this.server.stop();
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

        let startError: unknown = null;
        try {
          this.server = await startServer(config.server.port);
        } catch (err) {
          startError = err;
          if (isPortAccessError(err) && config.server.port !== 0) {
            if (!this.globals.json) {
              logger.warn(
                { host: config.server.host, port: config.server.port, err },
                "Port unavailable; retrying on a random port",
              );
            }
            try {
              this.server = await startServer(0);
            } catch (retryErr) {
              startError = retryErr;
            }
          }
        }

        if (!this.server) {
          if (!this.globals.json) {
            logger.error({ err: startError }, "Dev server failed to start");
          }
        } else {
          const runningPort = resolveRunningPort(this.server, config.server.port);
          if (!this.globals.json) {
            logger.info(
              { host: config.server.host, port: runningPort },
              `${this.commandName === "preview" ? "Preview" : "Dev"} server running`,
            );
          }
          if (config.server.openBrowser && !this.browserOpened) {
            const resourceUri = this.options.openResourceUri ?? config.appResources[0]?.resourceUri;
            if (resourceUri) {
              const parsed = parseResourceUri(resourceUri);
              if (parsed) {
                const url = `http://${config.server.host}:${runningPort}/ui/${parsed.namespace}/${parsed.resource}`;
                await tryOpenBrowser(url, logger);
                this.browserOpened = true;
              }
            }
          }
        }
      } else {
        if (!this.globals.json) {
          logger.error("Skipping server restart due to diagnostics");
        }
      }
    } catch (err) {
      logger.error({ err }, "Unexpected error in dev cycle");
    } finally {
      this.running = false;
      if (this.queued) {
        this.queued = false;
        await this.restart();
      }
    }
  }

  async stop() {
    if (this.server) {
      await this.server.stop();
      this.server = null;
    }
  }
}

const program = new Command();
program.name("tinyverse").description("Tinyverse CLI").version("0.1.0");
program.enablePositionalOptions();
program
  .option("--config <path>", "Path to config file", defaultConfigPath)
  .option("--out <path>", "Override outDir (or set TINYVERSE_OUT_DIR)", defaultOutDir)
  .option("--tools <glob...>", "Globs for tool sources")
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
  .option("--open", "Open browser when ready")
  .action(async (opts, command) => {
    const globals = getGlobalOptions(command);
    const runner = new DevRunner("dev", globals, () => loadCliConfig(globals), { open: opts.open as boolean });

    await runner.restart();

    const initialConfig = await loadCliConfig(globals);
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
      runner.restart();
    });

    const shutdown = async () => {
      await watcher.close();
      await runner.stop();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });

program
  .command("preview [path]")
  .description("Generate a preview UI for a tool and run the dev server")
  .option("--tool <id>", "Tool ID to preview")
  .option("--resource <uri>", "Resource URI to use (default ui://preview/<tool>)")
  .option("--entry <path>", "Entry file for the preview UI (default .tinyverse/preview-ui/main.tsx)")
  .option("--openai-key <key>", "OpenAI API Key for the preview planner")
  .option("--open", "Open browser when ready")
  .action(async (targetPath, opts, command) => {
    const globals = getGlobalOptions(command);
    if (opts.openaiKey) {
      process.env.OPENAI_API_KEY = opts.openaiKey as string;
    }

    if (targetPath) {
      const absPath = path.resolve(targetPath);
      const stats = await fs.stat(absPath);
      globals.tools = [stats.isDirectory() ? path.join(absPath, "**/*.{ts,tsx}") : absPath];
    }

    const initialConfig = await loadCliConfig(globals);
    const extractResult = await extractTools(initialConfig, { strict: globals.strict });

    let toolId = opts.tool as string | undefined;
    if (!toolId) {
      if (extractResult.manifest.tools.length === 1) {
        toolId = extractResult.manifest.tools[0].id;
        logger.info(`Auto-selected tool: ${toolId}`);
      } else if (extractResult.manifest.tools.length > 1) {
        logger.error("Multiple tools found. Please specify one with --tool <id>:");
        extractResult.manifest.tools.forEach((t) => logger.error(` - ${t.id}`));
        process.exit(1);
      } else {
        logger.error("No tools found to preview.");
        process.exit(1);
      }
    }

    const shellResourceUri = "ui://tinyverse/preview";
    const previewDir = path.resolve(".tinyverse", "preview-ui");
    const shellEntry = path.resolve(opts.entry ?? path.join(previewDir, "main.tsx"));

    // Resolve target resource URI and scaffold preview app once.
    const existing = initialConfig.appResources.find((r) => r.toolId === toolId);
    const tool = extractResult.manifest.tools.find((t) => t.id === toolId);
    const discoveredUi = extractResult.manifest.uiComponents.find((u) => u.toolId === toolId);
    const templateHint = tool?.previewTemplate ?? discoveredUi?.previewTemplate;

    const targetResourceUri =
      (opts.resource as string | undefined) ??
      existing?.resourceUri ??
      discoveredUi?.resourceUri ??
      `ui://preview/${sanitizeResource(toolId) || "resource"}`;

    await ensurePreviewApp(previewDir, toolId, targetResourceUri, templateHint);

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

    const runner = new DevRunner("preview", globals, buildPreviewConfig, {
      open: opts.open as boolean,
      openResourceUri: shellResourceUri,
    });

    await runner.restart();

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
      runner.restart();
    });

    const shutdown = async () => {
      await watcher.close();
      await runner.stop();
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
