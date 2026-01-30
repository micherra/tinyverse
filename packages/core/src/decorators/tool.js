export const tool = (options) => {
    return (_target, _propertyKey, descriptor) => {
        if (descriptor && typeof descriptor.value === "function") {
            descriptor.value.__tool = options;
        }
        return descriptor;
    };
};
//# sourceMappingURL=tool.js.map