# tinyverse

## Overview
- Runtime & package manager: Bun
- Language: TypeScript
- Lint/format: Biome
- Task runner / monorepo orchestration: Turbo
- Workspace layout: apps/, examples/, docs/, e2e/ (configured in bunfig.toml)

## Requirements
- Bun ≥ 1.2.21 (https://bun.sh)
- TypeScript ^5 (peer dependency)

## Setup
Install dependencies at the repo root:

```bash
bun install
```

## Run
Run the root entry script:

```bash
bun run index.ts
```

Turbo scripts (run from the repo root):

```bash
# Start dev processes (as configured in packages/apps when present)
bun run turbo:dev

# Build all packages/apps
bun run turbo:build

# Lint all packages/apps via Turbo
bun run turbo:lint
```

## Scripts
Defined in package.json at the repo root:

- biome:fmt — format all files (check only)
  - `bun run biome:fmt`
- biome:write — format and write changes
  - `bun run biome:write`
- biome:lint — lint/check
  - `bun run biome:lint`
- biome:fix — apply lint fixes
  - `bun run biome:fix`
- turbo:dev — run Turbo "dev" pipeline
  - `bun run turbo:dev`
- turbo:build — run Turbo "build" pipeline
  - `bun run turbo:build`
- turbo:lint — run Turbo "lint" pipeline
  - `bun run turbo:lint`
- test — run Bun test runner
  - `bun test`

Turbo pipeline is configured in turbo.json. Default tasks include build, dev, lint, and test.

## Environment variables
- TODO: Document required environment variables (if any) once packages/apps specify them.

## Tests
Bun's built-in test runner is wired via `bun test`.

```bash
bun test
```