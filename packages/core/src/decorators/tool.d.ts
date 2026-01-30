export interface ToolDecoratorOptions {
    id?: string;
    name?: string;
    description?: string;
    inputSchema: unknown;
    outputSchema?: unknown;
    resourceUri?: string;
}
export declare const tool: (options: ToolDecoratorOptions) => (_target: any, _propertyKey: string | symbol, descriptor?: PropertyDescriptor) => PropertyDescriptor | undefined;
//# sourceMappingURL=tool.d.ts.map