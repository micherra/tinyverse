import { Diagnostic, TinyverseConfig } from "@tinyverse/core";
interface VerifyOptions {
    strict?: boolean;
    headless?: boolean;
}
export interface VerifyResult {
    diagnostics: Diagnostic[];
    success: boolean;
}
export declare const verify: (config: TinyverseConfig, options?: VerifyOptions) => Promise<VerifyResult>;
export {};
//# sourceMappingURL=index.d.ts.map