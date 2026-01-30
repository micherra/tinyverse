import path from "path";
import fs from "fs-extra";
import { build as viteBuild } from "vite";
import react from "@vitejs/plugin-react";
import { AppsManifest, Diagnostic, TinyverseConfig, ToolManifest } from "@tinyverse/core";
import { getLogger } from "@tinyverse/core";

interface BuildOptions {
  strict?: boolean;
}

export interface BuildResult {
  manifest: AppsManifest;
  diagnostics: Diagnostic[];
  success: boolean;
}

const logger = getLogger();

const parseResourceUri = (uri: string): { namespace: string; resource: string } | null => {
  const match = /^ui:\/\/([A-Za-z0-9_\-]+)\/([A-Za-z0-9_\-]+)$/.exec(uri);
  if (!match) return null;
  return { namespace: match[1], resource: match[2] };
};

const addDiagnostic = (
  list: Diagnostic[],
  severity: Diagnostic["severity"],
  code: string,
  message: string,
  location?: string,
) => {
  list.push({ severity, code, message, location });
};

const loadToolManifest = async (outDir: string, diags: Diagnostic[]): Promise<ToolManifest | null> => {
  const manifestPath = path.join(outDir, "tool.manifest.json");
  if (!(await fs.pathExists(manifestPath))) {
    addDiagnostic(diags, "error", "TV_DIAG_TOOL_MANIFEST_MISSING", "tool.manifest.json not found", manifestPath);
    return null;
  }

  try {
    return await fs.readJSON(manifestPath);
  } catch (err) {
    addDiagnostic(
      diags,
      "error",
      "TV_DIAG_TOOL_MANIFEST_INVALID",
      `Failed to parse ${manifestPath}: ${String(err)}`,
      manifestPath,
    );
    return null;
  }
};

const collectAssets = async (root: string, distRoot: string): Promise<string[]> => {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const assets: string[] = [];
  for (const entry of entries) {
    const current = path.join(root, entry.name);
    if (entry.isDirectory()) {
      assets.push(...(await collectAssets(current, distRoot)));
    } else if (entry.isFile()) {
      if (entry.name === "index.html") continue;
      assets.push(path.relative(distRoot, current));
    }
  }
  return assets;
};

export const buildApps = async (config: TinyverseConfig, options: BuildOptions = {}): Promise<BuildResult> => {
  const diagnostics: Diagnostic[] = [];
  const toolManifest = await loadToolManifest(config.outDir, diagnostics);
  const toolLookup = new Map(toolManifest?.tools.map((tool) => [tool.id, tool]) ?? []);

  const seenResources = new Set<string>();
  const seenTools = new Set<string>();
  const resources: AppsManifest["resources"] = [];

  for (const resource of config.appResources) {
    if (seenResources.has(resource.resourceUri)) {
      addDiagnostic(
        diagnostics,
        "error",
        "TV_DIAG_UI_URI_DUPLICATE",
        `Duplicate resourceUri ${resource.resourceUri} in config`,
      );
      continue;
    }
    seenResources.add(resource.resourceUri);
    const isInternal = resource.toolId.startsWith("_tinyverse.") || resource.resourceUri === "ui://tinyverse/preview";
    if (seenTools.has(resource.toolId) && !isInternal) {
      addDiagnostic(
        diagnostics,
        "error",
        "TV_DIAG_TOOL_UI_DUPLICATE",
        `Tool ${resource.toolId} is mapped to multiple resources`,
        config.outDir,
      );
    }
    seenTools.add(resource.toolId);

    const toolEntry = toolLookup.get(resource.toolId);
    if (!toolEntry && !isInternal) {
      addDiagnostic(
        diagnostics,
        "error",
        "TV_DIAG_TOOL_ID_MISSING",
        `Tool ${resource.toolId} from config not found in tool.manifest.json`,
        path.join(config.outDir, "tool.manifest.json"),
      );
    } else if (toolEntry && toolEntry.resourceUri && toolEntry.resourceUri !== resource.resourceUri && !isInternal) {
      addDiagnostic(
        diagnostics,
        "error",
        "TV_DIAG_TOOL_UI_MISMATCH",
        `Tool ${resource.toolId} is mapped to ${resource.resourceUri} in config but ${toolEntry.resourceUri} in tool.manifest.json`,
        path.join(config.outDir, "tool.manifest.json"),
      );
    }

    if (!(await fs.pathExists(resource.entry))) {
      addDiagnostic(
        diagnostics,
        "error",
        "TV_DIAG_BUILD_ENTRYFILE_MISSING",
        `Entry file missing for ${resource.resourceUri}: ${resource.entry}`,
      );
      continue;
    }

    const parsed = parseResourceUri(resource.resourceUri);
    if (!parsed) {
      addDiagnostic(
        diagnostics,
        "error",
        "TV_DIAG_UI_URI_INVALID",
        `Invalid resourceUri ${resource.resourceUri} (expected ui://namespace/resource)`,
      );
      continue;
    }

    const distPath = path.resolve(config.distDir, parsed.namespace, parsed.resource);
    const tmpRoot = path.resolve(config.outDir, ".tmp", `${parsed.namespace}-${parsed.resource}`);
    await fs.ensureDir(tmpRoot);

    const entryAbsolute = path.resolve(resource.entry);
    const entryContent = await fs.readFile(entryAbsolute, "utf8");
    const isFullApp = entryContent.includes("createRoot(") || entryContent.includes("ReactDOM.render(");

    let scriptSrc: string;
    if (isFullApp) {
      scriptSrc = path.relative(tmpRoot, entryAbsolute);
    } else {
      const wrapperPath = path.join(tmpRoot, "wrapper.tsx");
      const relativeEntry = path.relative(tmpRoot, entryAbsolute).replace(/\\/g, "/");
      // Remove extension for import if it's .tsx or .ts
      const importPath = relativeEntry.replace(/\.tsx?$/, "");

      const wrapperContent = [
        'import React, { useState, useEffect } from "react";',
        'import { createRoot } from "react-dom/client";',
        `import Component from "${importPath}";`,
        'import { useTinyverseResponse } from "@tinyverse/core";',
        "",
        "const Wrapper = () => {",
        "  const msg = useTinyverseResponse();",
        "  const [data, setData] = useState<any>(null);",
        "  const [error, setError] = useState<string | null>(null);",
        "",
        "  useEffect(() => {",
        "    if (msg && msg !== data) {",
        "      setData(msg);",
        "      return;",
        "    }",
        "    if (data || msg) return;",
        "    let aborted = false;",
        "    const initialTimeout = setTimeout(() => {",
        "      if (data || aborted || msg) return;",
        `      fetch("/tools/${resource.toolId}", {`,
        '        method: "POST",',
        '        headers: { "Content-Type": "application/json" },',
        '        body: JSON.stringify({})',
        "      })",
        "        .then(res => res.json())",
        "        .then(json => {",
        "          if (!aborted && !data && !msg) {",
        `            setData({ data: json, toolId: "${resource.toolId}", resourceUri: "${resource.resourceUri}" });`,
        "          }",
        "        })",
        "        .catch(err => {",
        "          if (!aborted) {",
        '            console.error("Failed to fetch tool data:", err);',
        '            setError("Failed to load data from dev server.");',
        "          }",
        "        });",
        "    }, 50);",
        "    return () => { aborted = true; clearTimeout(initialTimeout); };",
        "  }, [msg, data]);",
        "",
        "  if (error) return <div style={{ padding: '20px', color: '#b91c1c', fontFamily: 'sans-serif', fontWeight: 'bold' }}>{error}</div>;",
        "  if (!data) return <div style={{ padding: '20px', color: '#64748b', fontFamily: 'sans-serif' }}>Loading tool data...</div>;",
        "  return <Component data={data.data} toolId={data.toolId} resourceUri={data.resourceUri} />;",
        "};",
        "",
        'const container = document.getElementById("root");',
        "if (container) {",
        "  const root = createRoot(container);",
        "  root.render(<Wrapper />);",
        "}",
      ].join("\n");
      await fs.writeFile(wrapperPath, wrapperContent, "utf8");
      scriptSrc = "./wrapper.tsx";
    }

    const tempHtml = path.join(tmpRoot, "index.html");
    const htmlContents = [
      "<!doctype html>",
      "<html>",
      "<head>",
      '  <meta charset="utf-8" />',
      `  <title>${resource.resourceUri}</title>`,
      "</head>",
      "<body>",
      '  <div id="root"></div>',
      `  <script type="module" src="${scriptSrc}"></script>`,
      "</body>",
      "</html>",
      "",
    ].join("\n");
    await fs.writeFile(tempHtml, htmlContents, "utf8");

    const base =
      config.bundler.base && config.bundler.base !== "/"
        ? config.bundler.base
        : `/ui/${parsed.namespace}/${parsed.resource}/`;

    try {
      await viteBuild({
        root: tmpRoot,
        base,
        plugins: [react()],
        envPrefix: ["VITE_", "OPENAI_"],
        build: {
          outDir: distPath,
          emptyOutDir: true,
          assetsInlineLimit: config.bundler.assetsInlineLimit,
          rollupOptions: {
            input: tempHtml,
          },
        },
      });
    } catch (err) {
      addDiagnostic(
        diagnostics,
        "error",
        "TV_DIAG_BUILD_FAILED",
        `Vite build failed for ${resource.resourceUri}: ${String(err)}`,
      );
      continue;
    }

    const entryFile = path.relative(config.distDir, path.join(distPath, "index.html"));
    const assets = await collectAssets(distPath, config.distDir);

    resources.push({
      resourceUri: resource.resourceUri,
      toolId: resource.toolId,
      entryFile,
      assets,
    });
  }

  const manifest: AppsManifest = {
    manifest_version: "tinyverse.apps.v0.1",
    name: config.name,
    version: config.version,
    generated_by: "tinyverse-builder",
    generated_at: new Date().toISOString(),
    outDir: config.distDir,
    resources,
  };

  await fs.ensureDir(config.outDir);
  const manifestPath = path.join(config.outDir, "apps.manifest.json");
  await fs.writeJSON(manifestPath, manifest, { spaces: 2 });

  if (toolManifest) {
    const resourceUriSet = new Set(config.appResources.map((r) => r.resourceUri));
    for (const tool of toolManifest.tools) {
      if (tool.resourceUri && !resourceUriSet.has(tool.resourceUri)) {
        addDiagnostic(
          diagnostics,
          "error",
          "TV_DIAG_UI_URI_MISSING_IN_APPS_MANIFEST",
          `Tool ${tool.id} references ${tool.resourceUri} but it is missing from config/appResources`,
          manifestPath,
        );
      }
    }
  }

  const success = diagnostics.length === 0 || (!options.strict && diagnostics.every((d) => d.severity === "warning"));
  if (success) {
    logger.info({ manifestPath }, "Wrote apps manifest");
  } else {
    logger.error({ diagnostics }, "Build emitted diagnostics");
  }

  return { manifest, diagnostics, success };
};
