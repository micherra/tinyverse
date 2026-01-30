export const envBool = (value, fallback) => {
    if (value === undefined)
        return fallback;
    return value === "true" || value === "1";
};
//# sourceMappingURL=env.js.map