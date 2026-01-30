import { TinyverseConfig, ToolManifest, Diagnostic } from "@tinyverse/core";
interface ExtractOptions {
    strict?: boolean;
}
export interface ExtractResult {
    manifest: ToolManifest;
    diagnostics: Diagnostic[];
    success: boolean;
}
export declare const extractTools: (config: TinyverseConfig, options?: ExtractOptions) => Promise<ExtractResult>;
export {};
//# sourceMappingURL=index.d.ts.map