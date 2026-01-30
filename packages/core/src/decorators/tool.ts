export interface ToolDecoratorOptions {
  id?: string;
  name?: string;
  description?: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  resourceUri?: string;
}

export const tool = (options: ToolDecoratorOptions) => {
  return (_target: any, _propertyKey: string | symbol, descriptor?: PropertyDescriptor) => {
    if (descriptor && typeof descriptor.value === "function") {
      (descriptor.value as any).__tool = options;
    }
    return descriptor;
  };
};
