// Auto-generated Tinyverse server routes. Do not edit by hand.
export type ToolRoute = { toolId: string; handlerPath: string };
export type ResourceRoute = { resourceUri: string; distPath: string; entryFile: string; assets: string[] };
export const toolRoutes: ToolRoute[] = [
  { toolId: "weather.getForecast", handlerPath: "../handlers/weather.getForecast" }
];
export const resourceRoutes: ResourceRoute[] = [
  { resourceUri: "ui://tinyverse/preview", distPath: "/Users/michelle/Documents/Codesmith/tinyverse/examples/weather-app/dist/preview/tinyverse/preview", entryFile: "tinyverse/preview/index.html", assets: ["tinyverse/preview/assets/index-CLsNTdtR.js","tinyverse/preview/assets/index-Vp__U4xM.css"] },
  { resourceUri: "ui://weather/forecast", distPath: "/Users/michelle/Documents/Codesmith/tinyverse/examples/weather-app/dist/preview/weather/forecast", entryFile: "weather/forecast/index.html", assets: ["weather/forecast/assets/index-BxHYs3aB.js","weather/forecast/assets/index-bSHu2UwD.css"] }
];
