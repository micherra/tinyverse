// Auto-generated Tinyverse server routes. Do not edit by hand.
export type ToolRoute = { toolId: string; handlerPath: string };
export type ResourceRoute = { resourceUri: string; distPath: string; entryFile: string; assets: string[] };
export const toolRoutes: ToolRoute[] = [
  { toolId: "weather.getForecast", handlerPath: "../handlers/weather.getForecast" }
];
export const resourceRoutes: ResourceRoute[] = [
  { resourceUri: "ui://weather/forecast", distPath: "dist/weather/forecast", entryFile: "weather/forecast/index.html", assets: ["weather/forecast/assets/index-BhyiZf_2.js","weather/forecast/assets/index-bSHu2UwD.css"] }
];
