import type { Diagnostic } from "@tinyverse/core";
import type { Logger } from "pino";

export interface EmitDiagnosticsOptions {
  command: string;
  diagnostics: Diagnostic[];
  success: boolean;
  json: boolean;
  logger: Logger;
  context?: Record<string, unknown>;
}

const logDiagnostic = (logger: Logger, command: string, diagnostic: Diagnostic) => {
  const log =
    diagnostic.severity === "error" ? logger.error.bind(logger) : diagnostic.severity === "warning" ? logger.warn.bind(logger) : logger.info.bind(logger);
  log(
    {
      command,
      code: diagnostic.code,
      location: diagnostic.location,
      details: diagnostic.details,
      suggestion: diagnostic.suggestion,
    },
    diagnostic.message,
  );
};

export const emitDiagnostics = (options: EmitDiagnosticsOptions) => {
  const { command, diagnostics, success, json, logger, context } = options;

  if (json) {
    const payload: Record<string, unknown> = {
      command,
      success,
      diagnostics,
    };
    if (context) payload.context = context;
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  if (diagnostics.length === 0) {
    logger.info({ command, ...(context ?? {}) }, "No diagnostics reported");
    return;
  }

  diagnostics.forEach((diag) => logDiagnostic(logger, command, diag));
  if (!success) {
    logger.error({ command }, "Command completed with diagnostics");
  }
};

