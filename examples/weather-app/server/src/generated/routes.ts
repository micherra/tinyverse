// Auto-generated Tinyverse server routes. Do not edit by hand.
export type ToolRoute = { toolId: string; handlerPath: string };
export type ResourceRoute = { resourceUri: string; distPath: string; entryFile: string; assets: string[] };
export const toolRoutes: ToolRoute[] = [
  { toolId: "weather.getForecast", handlerPath: "../handlers/weather.getForecast" }
];
export const resourceRoutes: ResourceRoute[] = [
  { resourceUri: "ui://weather/forecast", distPath: "/Users/michelle/Documents/Codesmith/tinyverse/examples/weather-app/dist/preview/weather/forecast", entryFile: "weather/forecast/index.html", assets: ["weather/forecast/assets/index-BECd99mL.css","weather/forecast/assets/index-BiX6Gthh.js"] }
];
