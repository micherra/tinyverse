import pino, { LevelWithSilent, Logger } from "pino";

const allowedLevels: LevelWithSilent[] = ["fatal", "error", "warn", "info", "debug", "trace", "silent"];

const resolveLevel = (value: string | undefined): LevelWithSilent => {
  if (value && allowedLevels.includes(value as LevelWithSilent)) {
    return value as LevelWithSilent;
  }
  return "info";
};

let cached: Logger | null = null;
let loggerLevel: LevelWithSilent = resolveLevel(process.env.TINYVERSE_LOG_LEVEL);

export const configureLogger = (options: { level?: LevelWithSilent } = {}) => {
  if (options.level) {
    loggerLevel = options.level;
    if (cached) {
      cached.level = options.level;
    }
  }
};

export const getLogger = (): Logger => {
  if (cached) return cached;
  cached = pino({
    level: loggerLevel,
  });
  return cached;
};
