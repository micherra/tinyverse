# Tinyverse — TypeScript-first MCP app scaffold

Tinyverse is a TypeScript-only CLI for building MCP apps end-to-end: it extracts decorator-annotated tools, bundles `ui://` resources with Vite (React), scaffolds a dev MCP server, and verifies wiring/boot with stable diagnostics. v0.1 enforces a 1:1 mapping between tools and resources and ships with the weather demo (now living under `examples/weather-app` to showcase the CLI).

## Requirements
- Node.js >=18
- npm (workspaces enabled)

## Quickstart (weather demo)
1. Install deps: `npm install`
2. Build CLI packages: `npm run build`
3. Enter the demo project and (idempotently) seed files: `cd examples/weather-app && npm run init`
4. Start the dev loop with the CLI: `npm run dev`
   - Server: http://127.0.0.1:8787 (falls back to a random port if 8787 is blocked; check the log)
   - UI: http://127.0.0.1:8787/ui/weather/forecast
5. From another terminal in the same folder, verify against the running server: `npm run verify`
   - Add `--strict` to fail on warnings; set `TINYVERSE_VERIFY_HEADLESS=true` to include boot checks.
6. Shortcut from repo root: `npm run demo` (build → init → dev inside `examples/weather-app`).

## CLI commands
Run commands from your project root (for the demo, that is `examples/weather-app`).
- `init`: Scaffold weather sample (decorated tool, React UI entry, config, server folders) without overwriting existing files.
- `extract`: Parse `toolGlobs` from `tinyverse.config.json`, infer schemas from decorators, and emit `.tinyverse/tool.manifest.json`; enforces unique IDs and required `inputSchema`.
- `build`: Run Vite for each `appResources` entry, outputting `dist/<namespace>/<resource>/index.html` + assets and `.tinyverse/apps.manifest.json`; enforces 1:1 tool↔resource mapping.
- `dev`: Watch tools, UI entries, and config; rerun extract/build; generate server artifacts under `server/src/generated` + handler stubs; restart Fastify server on `server.host:server.port` (defaults 127.0.0.1:8787).
- `verify`: Perform static wiring checks and live HTTP/resource checks against the running server; writes `.tinyverse/verify-report.json`.
- `preview`: Generate a lightweight preview UI for a specific tool (`--tool <id>`) and run it via the dev server (uses the `templates/ui-preview` scaffold by default).

**Global flags:** `--config <path>`, `--out <dir>`, `--strict`, `--json`, `--verbose`. Env fallbacks: `TINYVERSE_CONFIG`, `TINYVERSE_OUT_DIR`, `TINYVERSE_STRICT`, `TINYVERSE_JSON`, `TINYVERSE_VERBOSE`, `TINYVERSE_VERIFY_HEADLESS`.

## Configuration
`tinyverse.config.json` defines the project surface:
- `name`, `version`: project metadata.
- `toolGlobs`: TS sources containing decorator-annotated tools (TS-only).
- `appResources[]`: `{ toolId, resourceUri (ui://ns/res), entry }` with enforced 1:1 mapping.
- `tsconfig`: used for extraction.
- `outDir`: manifest + verify output directory (default `.tinyverse`).
- `distDir`: Vite build output root (default `dist`).
- `server`: `{ host, port, openBrowser }` used by `dev` and `verify`.
- `bundler`: Vite-specific settings (`framework: react`, `base`, `assetsInlineLimit`).

Example (`tinyverse.config.json`):
```json
{
  "name": "tinyverse-sample",
  "version": "0.1.0",
  "toolGlobs": ["tools/**/*.ts"],
  "appResources": [
    {
      "toolId": "weather.getForecast",
      "resourceUri": "ui://weather/forecast",
      "entry": "apps/weather/forecast/main.tsx"
    }
  ],
  "tsconfig": "tsconfig.json",
  "outDir": ".tinyverse",
  "distDir": "dist",
  "server": { "host": "127.0.0.1", "port": 8787, "openBrowser": false },
  "bundler": { "type": "vite", "framework": "react", "base": "/", "assetsInlineLimit": 4096 }
}
```
The weather demo keeps this at `examples/weather-app/tinyverse.config.json`.

## Outputs and layout
Paths are relative to the project root (e.g., `examples/weather-app/**` for the bundled demo).
- `.tinyverse/tool.manifest.json` — extracted tool definitions.
- `.tinyverse/apps.manifest.json` — built UI resources.
- `.tinyverse/verify-report.json` — diagnostics from `verify`.
- `dist/<namespace>/<resource>/index.html` + `assets/**` — Vite bundles keyed by `ui://` URI.
- `server/src/generated/` — manifests + route tables produced by `dev`.
- `server/src/handlers/` — handler stubs generated when missing.

## Repository structure
- `packages/` — core libraries (`@tinyverse/core`, extractor, builder, dev-server, verifier, CLI).
- `examples/weather-app/` — weather demo project (config, tools, UI, server) that demonstrates the CLI.
- `templates/ui-preview/` — reusable UI template you can copy to preview any tool/resource.
- `project-context/` — MRD/PRD/SAD and contracts describing v0.1.
- `.cursor/` — agent prompts/rules (framework metadata).
- `scripts/` — helper utilities (`scripts/smoke.mjs` runs extract→build→serve→verify against the demo).
- `templates/` — placeholders for future scaffolds.

## Development scripts
- `npm run build` — build all packages.
- `npm run demo` — build packages, then run the dev loop inside `examples/weather-app`.
- `npm test` — unit tests + smoke test.
- `npm run smoke` — run extract→build→serve→verify against the demo config.
- `npm run clean` — remove build artifacts (`dist`, `.tinyverse`, package dists, demo outputs).
- `npm run format` — check formatting (non-blocking).
