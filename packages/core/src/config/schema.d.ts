import { z } from "zod";
export declare const appResourceSchema: z.ZodObject<{
    toolId: z.ZodString;
    resourceUri: z.ZodString;
    entry: z.ZodString;
}, "strip", z.ZodTypeAny, {
    toolId: string;
    resourceUri: string;
    entry: string;
}, {
    toolId: string;
    resourceUri: string;
    entry: string;
}>;
export declare const configSchema: z.ZodObject<{
    name: z.ZodString;
    version: z.ZodString;
    toolGlobs: z.ZodArray<z.ZodString, "atleastone">;
    appResources: z.ZodArray<z.ZodObject<{
        toolId: z.ZodString;
        resourceUri: z.ZodString;
        entry: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        toolId: string;
        resourceUri: string;
        entry: string;
    }, {
        toolId: string;
        resourceUri: string;
        entry: string;
    }>, "many">;
    tsconfig: z.ZodString;
    outDir: z.ZodString;
    distDir: z.ZodString;
    server: z.ZodObject<{
        host: z.ZodString;
        port: z.ZodNumber;
        openBrowser: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        host: string;
        port: number;
        openBrowser: boolean;
    }, {
        host: string;
        port: number;
        openBrowser?: boolean | undefined;
    }>;
    bundler: z.ZodObject<{
        type: z.ZodLiteral<"vite">;
        framework: z.ZodLiteral<"react">;
        base: z.ZodDefault<z.ZodString>;
        assetsInlineLimit: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        type: "vite";
        framework: "react";
        base: string;
        assetsInlineLimit: number;
    }, {
        type: "vite";
        framework: "react";
        base?: string | undefined;
        assetsInlineLimit?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    name: string;
    version: string;
    toolGlobs: [string, ...string[]];
    appResources: {
        toolId: string;
        resourceUri: string;
        entry: string;
    }[];
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
}, {
    name: string;
    version: string;
    toolGlobs: [string, ...string[]];
    appResources: {
        toolId: string;
        resourceUri: string;
        entry: string;
    }[];
    tsconfig: string;
    outDir: string;
    distDir: string;
    server: {
        host: string;
        port: number;
        openBrowser?: boolean | undefined;
    };
    bundler: {
        type: "vite";
        framework: "react";
        base?: string | undefined;
        assetsInlineLimit?: number | undefined;
    };
}>;
export type ConfigInput = z.infer<typeof configSchema>;
//# sourceMappingURL=schema.d.ts.map