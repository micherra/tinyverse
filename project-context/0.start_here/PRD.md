# Tinyverse PRD (v0.1) — TS-first MCP Apps Scaffold + Toolchain

## 1) Product summary

**Tinyverse** is a TS-first toolchain that lets developers go from **annotated tools + UI entrypoints** to a 
**working MCP Apps server** in minutes.

Tinyverse:

* **extracts tool definitions** (schemas + metadata)
* **builds `ui://…` app resources** (static HTML/JS/CSS)
* **scaffolds + runs a thin MCP server** that serves both tools and `ui://` resources
* **verifies end-to-end** that everything is wired and bootable

**One-liner:** *From decorators → working MCP Apps server (tools + `ui://` UI) + verifier.*

## 2) Why now

MCP Apps-style tool-linked UI introduces a new integration surface:

* tool metadata wiring
* UI resource bundling
* server resource serving
* host/iframe constraints

Most teams can’t “just wire that up” quickly—Tinyverse makes the happy path real.

## 3) Target users

**Primary (v0.1):**

* Devs shipping MCP demos/products who want an end-to-end working baseline fast.
* DevEx/FDE/solutions folks who need a portable demo + repeatable setup.

**Secondary:**

* Tool authors who want consistent manifests + stubs and a known-good dev server.

## 4) Goals (v0.1)

1. **One product / one CLI** with a “green path”
2. **TS-first** tool extraction and schema correctness
3. **Build `ui://…` resources** from UI entrypoints (React-first templates OK)
4. **Reference server scaffold (dev-first)**

    * serves tools
    * serves `ui://` resources from build output
    * reload-friendly
5. **Verifier** that catches wiring/server/boot issues early

## 5) Non-goals (explicit)

* Not production-ready hosting defaults
* Not an auth/governance layer
* Not a full agent framework
* Not a multi-tenant platform
* Not “support every language/framework” in v0.1 (TS only)

## 6) Key user journeys

### Journey 1: “Working MCP App in <30 minutes”

1. `tinyverse init`
2. implement 1–2 tool stubs
3. implement 1 UI resource entry
4. `tinyverse dev`
5. open the app in an MCP host or use `tinyverse verify`

### Journey 2: “Bring existing repo”

1. add Tinyverse config
2. annotate tools + UI entrypoints
3. `tinyverse dev` starts a scaffold server in-place
4. later: replace scaffold server with their production server

## 7) MVP deliverables

* CLI commands: `init`, `extract`, `build`, `dev`, `verify`
* Outputs:

    * tool manifest
    * apps manifest
    * `dist/` bundles
    * scaffold server code + generated typed handler stubs
* Weather demo (flagship)

## 8) Success metrics

* Time to first running server with UI: **< 30 min**
* Time to first live `ui://` resource render: **< 10 min** in template
* Verifier catches common errors with actionable messages (wiring/build/serve/boot)