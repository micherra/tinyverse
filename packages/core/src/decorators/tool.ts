export interface ToolDecoratorOptions {
  id?: string;
  name?: string;
  description?: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  resourceUri?: string;
  previewTemplate?: string;
}

export const tool = (options: ToolDecoratorOptions) => {
  return (
    _target: object,
    _propertyKey: string | symbol,
    descriptor?: PropertyDescriptor,
  ) => {
    if (descriptor && typeof descriptor.value === "function") {
      (descriptor.value as { __tool?: ToolDecoratorOptions }).__tool = options;
    }
    return descriptor;
  };
};
