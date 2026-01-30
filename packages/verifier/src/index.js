import path from "path";
import fs from "fs-extra";
import { fetch } from "undici";
import { envBool } from "@tinyverse/core";
import { getLogger } from "@tinyverse/core";
const logger = getLogger();
const loadJson = async (filePath) => {
    if (!(await fs.pathExists(filePath)))
        return null;
    return fs.readJSON(filePath);
};
const addDiagnostic = (diags, severity, code, message, location) => {
    diags.push({ severity, code, message, location });
};
const parseResourceUri = (uri) => {
    const match = /^ui:\/\/([A-Za-z0-9_\-]+)\/([A-Za-z0-9_\-]+)$/.exec(uri);
    return match ? { namespace: match[1], resource: match[2] } : null;
};
const extractAssetLinks = (html) => {
    const links = [];
    const regex = /(href|src)=[\"']([^\"']+)[\"']/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
        const url = match[2];
        if (url.startsWith("http"))
            continue;
        links.push(url);
    }
    return links;
};
export const verify = async (config, options = {}) => {
    const diagnostics = [];
    const headless = options.headless ?? envBool(process.env.TINYVERSE_VERIFY_HEADLESS, false);
    const toolManifestPath = path.join(config.outDir, "tool.manifest.json");
    const appsManifestPath = path.join(config.outDir, "apps.manifest.json");
    const toolManifest = await loadJson(toolManifestPath);
    const appsManifest = await loadJson(appsManifestPath);
    if (!toolManifest) {
        addDiagnostic(diagnostics, "error", "TV_DIAG_TOOL_MANIFEST_MISSING", "tool.manifest.json not found", toolManifestPath);
    }
    if (!appsManifest) {
        addDiagnostic(diagnostics, "error", "TV_DIAG_APPS_MANIFEST_MISSING", "apps.manifest.json not found", appsManifestPath);
    }
    if (toolManifest && appsManifest) {
        const resourceLookup = new Map(appsManifest.resources.map((r) => [r.resourceUri, r]));
        const toolToResource = new Map(appsManifest.resources.map((r) => [r.toolId, r.resourceUri]));
        const seenResourceUris = new Set();
        for (const tool of toolManifest.tools) {
            if (tool.resourceUri) {
                const entry = resourceLookup.get(tool.resourceUri);
                if (!entry) {
                    addDiagnostic(diagnostics, "error", "TV_DIAG_UI_URI_MISSING_IN_APPS_MANIFEST", `Tool ${tool.id} references ${tool.resourceUri} but it is missing in apps manifest`, appsManifestPath);
                }
            }
        }
        for (const resource of appsManifest.resources) {
            const parsed = parseResourceUri(resource.resourceUri);
            if (!parsed) {
                addDiagnostic(diagnostics, "error", "TV_DIAG_UI_URI_INVALID", `Invalid resourceUri ${resource.resourceUri} in apps manifest`, appsManifestPath);
                continue;
            }
            if (seenResourceUris.has(resource.resourceUri)) {
                addDiagnostic(diagnostics, "error", "TV_DIAG_UI_URI_DUPLICATE", `Duplicate resourceUri ${resource.resourceUri} in apps manifest`, appsManifestPath);
            }
            seenResourceUris.add(resource.resourceUri);
            if (!toolManifest.tools.find((t) => t.id === resource.toolId)) {
                addDiagnostic(diagnostics, "warning", "TV_DIAG_TOOL_ID_MISSING", `Tool ${resource.toolId} from apps manifest not found in tool manifest`);
            }
            const indexPath = path.resolve(config.distDir, resource.entryFile);
            if (!(await fs.pathExists(indexPath))) {
                addDiagnostic(diagnostics, "error", "TV_DIAG_BUILD_ENTRYFILE_MISSING", `Entry file missing for ${resource.resourceUri}: ${indexPath}`);
            }
            for (const asset of resource.assets) {
                const assetPath = path.resolve(config.distDir, asset);
                if (!(await fs.pathExists(assetPath))) {
                    addDiagnostic(diagnostics, "error", "TV_DIAG_BUILD_ASSET_MISSING", `Asset missing for ${resource.resourceUri}: ${assetPath}`);
                }
            }
            const previous = toolToResource.get(resource.toolId);
            if (previous && previous !== resource.resourceUri) {
                addDiagnostic(diagnostics, "error", "TV_DIAG_TOOL_UI_DUPLICATE", `Tool ${resource.toolId} mapped to multiple resources (${previous} and ${resource.resourceUri})`);
            }
            toolToResource.set(resource.toolId, resource.resourceUri);
        }
        const base = `http://${config.server.host}:${config.server.port}`;
        for (const resource of appsManifest.resources) {
            const parsed = parseResourceUri(resource.resourceUri);
            if (!parsed)
                continue;
            const url = `${base}/ui/${parsed.namespace}/${parsed.resource}`;
            try {
                const res = await fetch(url);
                if (!res.ok) {
                    addDiagnostic(diagnostics, "error", "TV_DIAG_SERVER_RESOURCE_RESOLVE_FAIL", `Resource ${resource.resourceUri} returned ${res.status}`, url);
                }
                else {
                    const text = await res.text();
                    if (!text.includes("<html")) {
                        addDiagnostic(diagnostics, "warning", "TV_DIAG_RESOURCE_NOT_HTML", `Resource ${resource.resourceUri} did not return HTML`, url);
                    }
                    if (headless) {
                        const assetLinks = extractAssetLinks(text);
                        for (const asset of assetLinks) {
                            const assetUrl = asset.startsWith("/")
                                ? `${base}${asset}`
                                : `${base}/ui/${parsed.namespace}/${parsed.resource}/${asset}`;
                            try {
                                const assetRes = await fetch(assetUrl);
                                if (!assetRes.ok) {
                                    addDiagnostic(diagnostics, "error", "TV_DIAG_UI_BOOT_FAIL", `Headless check failed fetching ${asset} for ${resource.resourceUri}: ${assetRes.status}`, assetUrl);
                                }
                            }
                            catch (err) {
                                addDiagnostic(diagnostics, "error", "TV_DIAG_UI_BOOT_FAIL", `Headless check failed for ${resource.resourceUri}: ${String(err)}`, assetUrl);
                            }
                        }
                        if (!text.includes('id="root"')) {
                            addDiagnostic(diagnostics, "warning", "TV_DIAG_UI_BOOT_WARN", `Headless check: index.html for ${resource.resourceUri} missing root element`, url);
                        }
                    }
                }
            }
            catch (err) {
                addDiagnostic(diagnostics, "error", "TV_DIAG_SERVER_RESOURCE_RESOLVE_FAIL", `Failed to fetch ${resource.resourceUri}: ${String(err)}`, url);
            }
        }
        for (const tool of toolManifest.tools) {
            const url = `${base}/tools/${encodeURIComponent(tool.id)}`;
            try {
                const res = await fetch(url, { method: "POST", body: JSON.stringify({}), headers: { "content-type": "application/json" } });
                if (!res.ok) {
                    addDiagnostic(diagnostics, "error", "TV_DIAG_SERVER_TOOLCALL_FAIL", `Tool ${tool.id} returned ${res.status}`, url);
                }
            }
            catch (err) {
                addDiagnostic(diagnostics, "error", "TV_DIAG_SERVER_TOOLCALL_FAIL", `Failed to reach tool ${tool.id}: ${String(err)}`, url);
            }
        }
    }
    await fs.ensureDir(config.outDir);
    const reportPath = path.join(config.outDir, "verify-report.json");
    await fs.writeJSON(reportPath, { diagnostics, headless }, { spaces: 2 });
    const success = diagnostics.length === 0 || (!options.strict && diagnostics.every((d) => d.severity !== "error"));
    if (success) {
        logger.info({ reportPath }, "Verify succeeded");
    }
    else {
        logger.error({ reportPath, diagnostics }, "Verify reported issues");
    }
    return { diagnostics, success };
};
//# sourceMappingURL=index.js.map