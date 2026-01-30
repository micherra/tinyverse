# UI Preview Template

A minimal React UI you can copy into your project to preview a tool/resource without building a bespoke frontend. It posts JSON to a tool endpoint, shows the response, and surfaces wiring details.

## Files
- `templates/ui-preview/main.tsx` — entry point.
- `templates/ui-preview/src/App.tsx` — preview UI logic.
- `templates/ui-preview/styles.css` — lightweight styling.

## How to use
1) Copy the folder into your project, e.g. `apps/preview/`.
2) Open `App.tsx` and set:
   - `TOOL_ID` to your tool ID (e.g. `"weather.getForecast"`).
   - `RESOURCE_URI` to your `ui://` URI (e.g. `"ui://weather/preview"`).
   - Update the default payload in `payloadSeed` to match your tool input.
3) Update `tinyverse.config.json`:
   ```json
   {
     "toolId": "<your tool id>",
     "resourceUri": "<your ui:// uri>",
     "entry": "apps/preview/main.tsx"
   }
   ```
4) Run `tinyverse extract`, `tinyverse build`, or `tinyverse dev` as usual. Open `/ui/<namespace>/<resource>` to preview.

Tip: Keep this template alongside your app resources so it rebuilds with the rest of your project. You can also duplicate it per tool if you want multiple preview pages.
