
# Tinyverse Engineering Spec (v0.1) — TS-first + Reference Server Scaffold

## 0) Locked decisions

* **TS-first only** (tools + server scaffold)
* **Reference scaffold server**: dev-first, not production-ready
* **1 tool → 1 `ui://` UI resource** (v0.1)
* No proprietary UI props/contract; UI is standard web assets loaded by hosts; Tinyverse focuses on wiring/build/serve/verify.

---

## 1) CLI surface

Binary: `tinyverse` (alias optional)

### v0.1 commands

1. `tinyverse init`
2. `tinyverse extract`
3. `tinyverse build`
4. `tinyverse dev`
5. `tinyverse verify`

Common flags:

* `--config <path>` default `tinyverse.config.json`
* `--out <dir>` default `.tinyverse/`
* `--strict` fail on warnings
* `--json` machine-readable output
* `--verbose` include logs

---

## 2) High-level architecture

### Modules

* `config`: config parsing + env interpolation
* `diagnostics`: stable CLI diagnostics (codes/severity/message/location/suggestion)
* `manifests`: schema validation + canonicalization
* `extract/ts`: TS AST extraction + JSON schema generation
* `build/ui`: bundler wrapper (produces HTML/JS/CSS artifacts) + apps manifest
* `scaffold/server`: server generator + runtime
* `dev/watch`: watch mode orchestration (extract/build + restart server)
* `verify/static`: consistency checks across outputs
* `verify/live`: hit running server to validate resources + basic boot

---

## 3) Artifact contracts

### 3.1 Tool Manifest (`tinyverse.tool.v0.1`)

Output: `.tinyverse/tool.manifest.json`

Top-level:

* `manifest_version`, `name`, `version`, `generated_by`, `generated_at`
* `tools[]`

Tool entry:

* `id` (stable namespaced ID)
* `mcp` tool definition:

    * `name`, `description`
    * `inputSchema` (required)
    * `outputSchema` (optional)
* `_meta.ui.resourceUri` (optional; required if tool has UI)

### 3.2 Apps Manifest (`tinyverse.apps.v0.1`)

Output: `.tinyverse/apps.manifest.json`

Top-level:

* `manifest_version`, `name`, `version`, `generated_by`, `generated_at`
* `outDir` (e.g. `dist`)
* `resources[]`

Resource entry:

* `resourceUri` (e.g. `ui://weather/forecast`)
* `toolId` (exactly one; v0.1)
* `entryFile` (built HTML file path)
* `assets[]` (built asset paths)

### 3.3 UI build outputs

* `dist/<namespace>/<resource>/index.html`
* `dist/<namespace>/<resource>/assets/**`

---

## 4) `tinyverse init` (project scaffold)

### Purpose

Create a working starter repo with:

* example tool annotations
* example UI resource entrypoint
* scaffold MCP server
* config wired so `tinyverse dev` works immediately

### Outputs (suggested layout)

```
/tools/
  weather.ts            # annotated tool(s)
/apps/
  weather/forecast.tsx  # UI resource entry
/server/
  src/
    index.ts
    mcp/
      toolRouter.ts
      resourceRouter.ts
    generated/          # manifests copied/symlinked from .tinyverse
    handlers/           # generated stubs (user edits)
/tinyverse.config.json
/package.json
```

### Acceptance criteria

* `tinyverse dev` runs after `npm install` with zero edits (tools can be mocked initially).

---

## 5) `tinyverse extract` (TS tools → tool manifest)

### Inputs

* tool source globs
* TS config path
* annotation API (decorators or builder fn)

### Output

* `.tinyverse/tool.manifest.json`
* optional diagnostics report

### TS schema support (v0.1)

Supported:

* primitives, arrays, objects, optional props
* string literal unions → enums

Unsupported unless explicit schema override:

* conditional/mapped types
* unions of object shapes
* complex generics

### Validation

* unique tool IDs
* input schema exists
* if tool annotated with UI: valid `ui://` URI format

---

## 6) `tinyverse build` (UI entrypoints → `ui://` resources)

### Inputs

`apps.resources[]` from config:

* `toolId`
* `resourceUri`
* `entry` (source path, e.g. `apps/weather/forecast.tsx`)

### Outputs

* `dist/**`
* `.tinyverse/apps.manifest.json`

### Build requirements (v0.1)

* Produce static `index.html` + assets
* Deterministic output paths based on `resourceUri`
* Verify assets referenced exist (no broken builds)

### Integrity checks

* entry exists
* `entryFile` exists after build
* all assets exist
* 1:1 mapping enforced:

    * each UI-linked tool has exactly one resource
    * each resource has exactly one toolId

---

## 7) `tinyverse dev` (orchestrated local loop)

### Responsibilities

* watch tools and apps
* run `extract` + `build` on change
* generate/update server scaffold output (handlers, router tables, manifest copies)
* start/restart the scaffold MCP server

### Behavior

* `dev` should be “one command to green path”
* server reads generated manifests and serves:

    * tools
    * `ui://` resources from dist

---

## 8) Scaffold MCP server (dev-first reference runtime)

### Purpose

A thin server that makes MCP Apps end-to-end runnable locally.

### Must-have runtime features

1. **Tool router**

* Load `tool.manifest.json`
* Register tool definitions
* Route tool calls to handlers in `/server/src/handlers`

2. **Generated typed handler stubs**

* For each tool:

    * generate `server/src/handlers/<toolId>.ts`
    * signature matches inferred input/output types (best effort)
    * default implementation throws NotImplemented (or returns mock in template)

3. **UI resource router**

* Load `apps.manifest.json`
* Map `ui://namespace/resource` → `dist/namespace/resource/index.html`
* Serve HTML + assets (static file serving)

4. **Dev ergonomics**

* fast restart
* clear logs (requests, tool calls, resource resolutions)

### Explicitly not included

* auth middleware
* user sessions
* persistence/db
* rate limiting
* production deployment config

### Acceptance criteria

* Running `tinyverse dev` starts a server that:

    * serves the tool list
    * can execute at least one tool (mock ok)
    * serves `ui://weather/forecast` and its assets from `dist/`

---

## 9) `tinyverse verify` (static + live, now against the scaffold server or any server)

### 9.1 Static checks

* tool↔resource wiring:

    * every tool with `_meta.ui.resourceUri` appears in apps manifest
* build integrity:

    * entryFile exists
    * assets exist
* 1:1 mapping constraint holds

### 9.2 Live checks (server required)

Given `server.endpoint`:

* Verify tool endpoint reachable
* For each `resourceUri`:

    * request it via server’s resource mechanism (or the server’s HTTP mapping if that’s your scaffold API)
    * confirm HTML returned, assets resolvable
* Optional: boot check

    * load returned HTML in headless browser
    * ensure no fatal load errors (basic “boots”)

### Output

* `.tinyverse/verify-report.json`
* human summary

---

## 10) Diagnostics (CLI-only, stable)

Tinyverse uses stable diagnostic codes **for CLI/reporting only**.

Diagnostic structure:

* `code`, `severity`, `message`, `details`, `location?`, `suggestion?`

Example codes:

* `TV_DIAG_TOOL_SCHEMA_MISSING`
* `TV_DIAG_UI_URI_INVALID`
* `TV_DIAG_UI_URI_MISSING_IN_APPS_MANIFEST`
* `TV_DIAG_BUILD_ENTRYFILE_MISSING`
* `TV_DIAG_BUILD_ASSET_MISSING`
* `TV_DIAG_SERVER_RESOURCE_RESOLVE_FAIL`
* `TV_DIAG_SERVER_TOOLCALL_FAIL`
* `TV_DIAG_UI_BOOT_FAIL`

---

## 11) v0.1 demo scope (Weather)

* Tools: `weather.getForecast` (minimum)
* UI resource: `ui://weather/forecast`
* Scaffold server serves both
* `tinyverse verify` passes against local server

---

## 12) Milestones (TS-first)

**M0** Schemas + fixtures + init template
**M1** Extract (TS)
**M2** Build (UI resources)
**M3** Scaffold server generation + `dev` orchestration
**M4** Verify (static + live)
**M5** Weather demo polish + docs