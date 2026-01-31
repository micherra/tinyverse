# Tinyverse Weather Demo

This folder hosts the self-contained weather demo that ships with the Tinyverse CLI. It shows the CLI wiring end-to-end: a decorated tool (`weather.getForecast`), a React UI mapped to `ui://weather/forecast`, and the scaffold dev server that serves both.

## Prereqs
- Run `npm install` at the repo root.
- Build the CLI packages once: `npm run build` (from the repo root).

## Quickstart
1) `cd examples/weather-app`
2) Seed demo files (idempotent): `npm run init`
3) Start the dev loop: `npm run dev`
   - The server tries `127.0.0.1:8787`; if blocked, it logs a random port to use for the UI.
4) Open the UI: `http://127.0.0.1:<port>/ui/weather/forecast` (use the port from the dev log).
5) In another terminal (same folder), verify against the running server: `npm run verify`
   - Add `--strict` to fail on warnings; set `TINYVERSE_VERIFY_HEADLESS=true` for asset fetch checks.

Or jump straight to the CLI-driven preview UI:
- `npm run preview` to generate the preview scaffold and serve it (auto-opens your browser).

## Scripts
- `npm run init` — writes `tinyverse.config.json`, tool stub, UI entry, and server handlers if missing.
- `npm run extract` — generates `.tinyverse/tool.manifest.json` from decorated tools.
- `npm run build` — bundles the UI and writes `.tinyverse/apps.manifest.json`.
- `npm run dev` — watches tools/UI/config, rebuilds, and runs the dev server with auto-restart.
- `npm run verify` — static + live checks against the running server.

## Layout
- `tinyverse.config.json` — demo config (toolGlobs, appResources, bundler, server).
- `tools/weather/forecast.ts` — decorator-defined tool returning real forecasts using Open-Meteo API.
- `apps/weather/forecast/ForecastCards.tsx` — Decorated React UI for `ui://weather/forecast`.
- `server/src/handlers/weather.getForecast.ts` — Logic for the `weather.getForecast` tool.
- `.tinyverse/`, `dist/` — generated artifacts (safe to delete).

## Cleaning up
From the repo root: `npm run clean` removes top-level and demo build artifacts. Within this folder you can also delete `.tinyverse/`, `dist/`, and `server/src/generated/` if you want a fresh rebuild.
