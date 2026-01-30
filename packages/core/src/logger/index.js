import pino from "pino";
const allowedLevels = ["fatal", "error", "warn", "info", "debug", "trace", "silent"];
const resolveLevel = (value) => {
    if (value && allowedLevels.includes(value)) {
        return value;
    }
    return "info";
};
let cached = null;
let loggerLevel = resolveLevel(process.env.TINYVERSE_LOG_LEVEL);
export const configureLogger = (options = {}) => {
    if (options.level) {
        loggerLevel = options.level;
        if (cached) {
            cached.level = options.level;
        }
    }
};
export const getLogger = () => {
    if (cached)
        return cached;
    cached = pino({
        level: loggerLevel,
    });
    return cached;
};
//# sourceMappingURL=index.js.map