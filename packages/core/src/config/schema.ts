import { z } from "zod";

export const appResourceSchema = z.object({
  toolId: z.string().min(1, "toolId required"),
  resourceUri: z
    .string()
    .regex(/^ui:\/\/[a-zA-Z0-9_\-]+\/[a-zA-Z0-9_\-]+$/, "resourceUri must match ui://namespace/resource"),
  entry: z.string().min(1, "entry required"),
});

export const configSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  toolGlobs: z.array(z.string().min(1)).nonempty(),
  appResources: z.array(appResourceSchema),
  tsconfig: z.string().min(1),
  outDir: z.string().min(1),
  distDir: z.string().min(1),
  server: z.object({
    host: z.string().min(1),
    port: z.number().int().positive(),
    openBrowser: z.boolean().default(false),
  }),
  bundler: z.object({
    type: z.literal("vite"),
    framework: z.literal("react"),
    base: z.string().default("/"),
    assetsInlineLimit: z.number().int().positive().default(4096),
  }),
});

export type ConfigInput = z.infer<typeof configSchema>;
