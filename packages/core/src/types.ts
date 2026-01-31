export type Severity = "info" | "warning" | "error";

export interface Diagnostic {
  code: string;
  severity: Severity;
  message: string;
  details?: string;
  location?: string;
  suggestion?: string;
}

export interface ToolManifestEntry {
  id: string;
  name: string;
  description?: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  resourceUri?: string;
  previewTemplate?: string;
}

export interface ToolManifest {
  manifest_version: string;
  name: string;
  version: string;
  generated_by: string;
  generated_at: string;
  tools: ToolManifestEntry[];
  uiComponents: UiComponentManifestEntry[];
}

export interface UiComponentManifestEntry {
  toolId: string;
  resourceUri: string;
  entry: string;
  previewTemplate?: string;
}

export interface AppResource {
  resourceUri: string;
  toolId: string;
  entry: string;
}

export interface AppsManifestEntry {
  resourceUri: string;
  toolId: string;
  entryFile: string;
  assets: string[];
}

export interface AppsManifest {
  manifest_version: string;
  name: string;
  version: string;
  generated_by: string;
  generated_at: string;
  outDir: string;
  resources: AppsManifestEntry[];
}

export interface TinyverseConfig {
  name: string;
  version: string;
  toolGlobs: string[];
  appResources: AppResource[];
  tsconfig: string;
  outDir: string;
  distDir: string;
  server: {
    host: string;
    port: number;
    openBrowser: boolean;
  };
  bundler: {
    type: "vite";
    framework: "react";
    base: string;
    assetsInlineLimit: number;
  };
}
