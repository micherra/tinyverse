# Tinyverse

**From decorators → working MCP Apps server in minutes.**

Tinyverse is a TypeScript-first toolchain for building [Model Context Protocol (MCP)](https://modelcontextprotocol.io) applications end-to-end. It bridges the gap between defining raw tools and serving interactive, tool-linked UI resources (`ui://`).

## Why Tinyverse?

Building MCP Apps introduces a complex integration surface: extracting tool metadata, bundling UI assets for iframes, serving resources correctly, and ensuring everything is wired up. Tinyverse automates this entire pipeline, allowing you to focus on your tools and UI logic rather than the plumbing.

- 🚀 **Zero-Config Start**: Go from `init` to a running server with a working weather demo in seconds.
- 🛠️ **Decorator-Driven**: Define tools and UI mappings directly in your TypeScript code. No manual JSON schema maintenance.
- 📦 **Vite-Powered UI**: Seamlessly bundle React-based UI resources into optimized static assets.
- 🔄 **Orchestrated Dev Loop**: Automatic extraction, building, and server-restarting as you code.
- 🛡️ **Built-in Verifier**: Static and live diagnostics that catch wiring and boot issues before you ship.

---

## Quickstart: Weather Demo

The fastest way to see Tinyverse in action is by running the built-in weather demo.

```bash
# 1. Install dependencies and build the toolchain
npm install && npm run build

# 2. Run the demo shortcut
# This initializes the demo in examples/weather-app and launches a preview
npm run demo
```

---

## Bringing Your Own Project to Life

Tinyverse is designed to be added to existing TypeScript projects as easily as it scaffolds new ones.

### 1. Installation

Add the Tinyverse core and CLI to your project:

```bash
npm install @tinyverse/core
npm install --save-dev @tinyverse/cli
```

### 2. Configuration

Create a `tinyverse.config.json` in your root directory. This tells Tinyverse where to find your tools and how to build your UI.

```json
{
  "name": "my-mcp-app",
  "version": "1.0.0",
  "toolGlobs": ["src/tools/**/*.ts"],
  "uiGlobs": ["src/ui/**/*.tsx"],
  "tsconfig": "tsconfig.json",
  "outDir": ".tinyverse",
  "distDir": "dist"
}
```

### 3. Annotate Your Tools

Use the `@tool` decorator to mark methods as MCP tools. Tinyverse automatically infers the input and output schemas from your TypeScript types.

```typescript
import { tool } from "@tinyverse/core";

export class DataTools {
  @tool({
    id: "data.fetch",
    description: "Fetches items from the database",
    resourceUri: "ui://data/list" // Optional: Link to a UI resource
  })
  async fetchItems(args: { category: string; limit?: number }) {
    // Implementation here...
    return { items: [] };
  }
}
```

### 4. Annotate Your UI (Optional)

If your tool has a visual component, create a React component and link it using `@tinyverseUi`.

```tsx
import { tinyverseUi } from "@tinyverse/core";

const ItemList = ({ data }) => (
  <ul>{data.items.map(item => <li key={item.id}>{item.name}</li>)}</ul>
);

export default tinyverseUi({ 
  toolId: "data.fetch", 
  resourceUri: "ui://data/list" 
})(ItemList);
```

### 5. Start Development

Run the dev command to start the orchestrated watch-build-serve loop.

```bash
npx tinyverse dev --open
```

Tinyverse will:
1. **Extract** your tool metadata into `.tinyverse/tool.manifest.json`.
2. **Build** your UI components into static assets in `dist/`.
3. **Scaffold** a reference MCP server in `server/` (if it doesn't exist).
4. **Generate** handler stubs in `server/src/handlers/` for your tools.
5. **Start** the MCP server and open your browser to the UI resource.

---

## The Tinyverse Toolchain

The `tinyverse` CLI provides all the commands needed for the MCP App lifecycle:

| Command | Purpose |
| :--- | :--- |
| `init` | Scaffolds a complete weather demo project. |
| `dev` | **The "Green Path"**: Orchestrates watch, extract, build, and server restart. |
| `preview` | Generates a temporary UI shell to test a specific tool in isolation. |
| `extract` | Parses TS decorators and generates `tool.manifest.json`. |
| `build` | Bundles React components into `ui://` static assets via Vite. |
| `verify` | Runs static and live checks to ensure E2E integrity. |

### Common Flags
- `--config <path>`: Custom config (default: `tinyverse.config.json`).
- `--out <path>`: Where to store manifests and build artifacts.
- `--strict`: Fail the build on any warning.
- `--json`: Output diagnostics in machine-readable format.

---

## Configuration Reference (`tinyverse.config.json`)

| Field | Description | Default |
| :--- | :--- | :--- |
| `name` | Project name. | Required |
| `version` | Project version. | Required |
| `toolGlobs` | Array of globs to find annotated tools. | Required |
| `uiGlobs` | Array of globs to find annotated UI components. | Optional |
| `appResources` | List of `{ toolId, resourceUri, entry }` mappings. | `[]` |
| `tsconfig` | Path to `tsconfig.json`. | `tsconfig.json` |
| `outDir` | Directory for manifests and build metadata. | `.tinyverse` |
| `distDir` | Directory for built UI assets. | `dist` |
| `server.port` | Port for the reference MCP server. | `8787` |
| `bundler.type` | Bundler to use (only `vite` supported). | `vite` |

---

## Architecture & Layout

Tinyverse organizes your project for both development speed and production readiness:

- **`.tinyverse/`**: Internal manifests and temporary artifacts.
- **`dist/`**: Production-ready static UI assets organized by `ui://` namespace.
- **`server/`**: A reference MCP server implementation.
  - `src/handlers/`: Where you implement your tool logic (handlers are generated here).
  - `src/generated/`: Auto-generated routes and manifests used by the server.

## Philosophy

Tinyverse is built for developers who value **correctness** and **velocity**. By leveraging TypeScript as the single source of truth, it eliminates the "schema gap" common in tool development. It doesn't just build your app; it verifies that it *actually works* through its unique live-probing verifier.

---

## License
Apache-2.0
