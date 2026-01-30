import { FastifyInstance } from "fastify";
export interface ServerOptions {
    outDir: string;
    distDir: string;
    host: string;
    port: number;
}
export interface ServerHandle {
    app: FastifyInstance;
    start: () => Promise<void>;
    stop: () => Promise<void>;
}
export declare const createServer: (options: ServerOptions) => Promise<ServerHandle>;
//# sourceMappingURL=index.d.ts.map