import { AppsManifest, Diagnostic, TinyverseConfig } from "@tinyverse/core";
interface BuildOptions {
    strict?: boolean;
}
export interface BuildResult {
    manifest: AppsManifest;
    diagnostics: Diagnostic[];
    success: boolean;
}
export declare const buildApps: (config: TinyverseConfig, options?: BuildOptions) => Promise<BuildResult>;
export {};
//# sourceMappingURL=index.d.ts.map