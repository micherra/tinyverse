import path from "path";
import fs from "fs-extra";
import fg from "fast-glob";
import ts from "typescript";
import {
  getLogger,
  TinyverseConfig,
  ToolManifest,
  ToolManifestEntry,
  UiComponentManifestEntry,
  Diagnostic,
} from "@tinyverse/core";

interface ExtractOptions {
  strict?: boolean;
}

export interface ExtractResult {
  manifest: ToolManifest;
  diagnostics: Diagnostic[];
  success: boolean;
}

const logger = getLogger();

const addDiagnostic = (
  list: Diagnostic[],
  severity: Diagnostic["severity"],
  code: string,
  message: string,
  location?: string,
  suggestion?: string,
  details?: string,
) => {
  list.push({ severity, code, message, location, suggestion, details });
};

const loadTsConfig = (
  tsconfigPath: string,
  diagnostics: Diagnostic[],
): { options: ts.CompilerOptions; fileNames: string[] } | null => {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    addDiagnostic(
      diagnostics,
      "error",
      "TV_DIAG_TSCONFIG_INVALID",
      `Failed to read tsconfig at ${tsconfigPath}`,
      tsconfigPath,
      undefined,
      ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"),
    );
    return null;
  }

  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(tsconfigPath));
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    addDiagnostic(
      diagnostics,
      "error",
      "TV_DIAG_TSCONFIG_INVALID",
      `tsconfig parse error at ${tsconfigPath}`,
      tsconfigPath,
      undefined,
      ts.flattenDiagnosticMessageText(first.messageText, "\n"),
    );
    return null;
  }

  return { options: parsed.options, fileNames: parsed.fileNames };
};

const evaluateLiteral = (node: ts.Expression): unknown | undefined => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(evaluateLiteral);
  if (ts.isObjectLiteralExpression(node)) {
    const obj: Record<string, unknown> = {};
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) continue;
      const name = ts.isShorthandPropertyAssignment(prop)
        ? prop.name.text
        : ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)
        ? prop.name.text
        : undefined;
      if (!name) continue;
      const value = ts.isShorthandPropertyAssignment(prop)
        ? prop.name.text
        : evaluateLiteral(prop.initializer as ts.Expression);
      obj[name] = value;
    }
    return obj;
  }
  return undefined;
};

const parseToolDecorator = (decorator: ts.Decorator): Record<string, unknown> | null => {
  const expr = decorator.expression;
  if (!ts.isCallExpression(expr)) return null;
  const decoratorName = ts.isIdentifier(expr.expression) ? expr.expression.text : undefined;
  if (decoratorName !== "tool") return null;
  const [arg] = expr.arguments;
  if (!arg || !ts.isObjectLiteralExpression(arg)) return null;
  const parsed = evaluateLiteral(arg);
  return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
};

const parseUiDecorator = (decorator: ts.Decorator): Record<string, unknown> | null => {
  const expr = decorator.expression;
  if (!ts.isCallExpression(expr)) return null;
  const decoratorName = ts.isIdentifier(expr.expression) ? expr.expression.text : undefined;
  if (decoratorName !== "tinyverseUi") return null;
  const [arg] = expr.arguments;
  if (!arg) return null;

  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
    return { toolId: arg.text };
  }

  if (ts.isObjectLiteralExpression(arg)) {
    const parsed = evaluateLiteral(arg);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  }
  return null;
};

const isStringLiteralUnion = (type: ts.Type): string[] | null => {
  if (!type.isUnion()) return null;
  const values: string[] = [];
  for (const t of type.types) {
    if ((t.flags & ts.TypeFlags.StringLiteral) !== 0) {
      values.push((t as ts.StringLiteralType).value);
    } else if ((t.flags & ts.TypeFlags.Undefined) !== 0 || (t.flags & ts.TypeFlags.Null) !== 0) {
      continue;
    } else {
      return null;
    }
  }
  return values.length > 0 ? values : null;
};

const inferSchemaFromType = (
  type: ts.Type,
  checker: ts.TypeChecker,
  diagnostics: Diagnostic[],
  file: string,
  toolId: string,
  pathLabel: string,
  seen: Set<number>,
): unknown | undefined => {
  const typeId = (type as { id?: number }).id;
  if (typeId && seen.has(typeId)) {
    return undefined;
  }
  if (typeId) seen.add(typeId);

  const typeString = checker.typeToString(type);

  if (type.isUnion()) {
    const enumValues = isStringLiteralUnion(type);
    if (enumValues) {
      return { type: "string", enum: enumValues };
    }
  }

  if (type.flags & ts.TypeFlags.StringLike) {
    return { type: "string" };
  }
  if (type.flags & ts.TypeFlags.NumberLike || type.flags & ts.TypeFlags.BigIntLike) {
    return { type: "number" };
  }
  if (type.flags & ts.TypeFlags.BooleanLike) {
    return { type: "boolean" };
  }

  if (checker.isTupleType(type)) {
    const tupleElements = checker.getTypeArguments(type as ts.TypeReference);
    const itemSchemas = tupleElements
      .map((t, idx) => inferSchemaFromType(t, checker, diagnostics, file, toolId, `${pathLabel}[${idx}]`, seen))
      .filter(Boolean);
    if (itemSchemas.length === tupleElements.length && itemSchemas.length > 0) {
      return { type: "array", items: itemSchemas.length === 1 ? itemSchemas[0] : { anyOf: itemSchemas } };
    }
    return { type: "array" };
  }

  if (checker.isArrayType(type)) {
    const typeArgs = checker.getTypeArguments(type as ts.TypeReference);
    const element = typeArgs[0];
    const items = element
      ? inferSchemaFromType(element, checker, diagnostics, file, toolId, `${pathLabel}[]`, seen)
      : undefined;
    return items ? { type: "array", items } : { type: "array" };
  }

  if (type.getFlags() & ts.TypeFlags.Object) {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const prop of checker.getPropertiesOfType(type)) {
      const decl = prop.valueDeclaration ?? prop.declarations?.[0];
      // Use the symbol's declaration if available, otherwise we may need to use any for this specific TS internal
      const propType = decl
        ? checker.getTypeOfSymbolAtLocation(prop, decl)
        : checker.getTypeOfSymbolAtLocation(prop, type as unknown as ts.Node);
      const schema = inferSchemaFromType(
        propType,
        checker,
        diagnostics,
        file,
        toolId,
        `${pathLabel}.${prop.name}`,
        seen,
      );
      if (schema) {
        properties[prop.name] = schema;
      }
      const isOptional =
        Boolean(prop.getFlags() & ts.SymbolFlags.Optional) ||
        (decl && "questionToken" in decl && (decl as { questionToken?: unknown }).questionToken !== undefined);
      if (!isOptional) {
        required.push(prop.name);
      }
    }

    const result: Record<string, unknown> = { type: "object", properties };
    if (required.length > 0) {
      result.required = required;
    }
    return result;
  }

  addDiagnostic(
    diagnostics,
    "warning",
    "TV_DIAG_SCHEMA_INFER_UNSUPPORTED",
    `Unsupported type "${typeString}" while inferring schema for ${toolId} at ${pathLabel}. Provide an explicit schema in the decorator.`,
    file,
  );
  return undefined;
};

const inferInputSchema = (
  node: ts.Node,
  checker: ts.TypeChecker,
  diagnostics: Diagnostic[],
  file: string,
  toolId: string,
): unknown | undefined => {
  if (!("parameters" in node) || !(node as ts.FunctionLikeDeclarationBase).parameters?.length) {
    return { type: "object", properties: {} };
  }
  const param = (node as ts.FunctionLikeDeclarationBase).parameters[0];
  if (!param.type) {
    addDiagnostic(
      diagnostics,
      "warning",
      "TV_DIAG_SCHEMA_INFER_MISSING_TYPE",
      `Cannot infer input schema for ${toolId}; first parameter lacks a type annotation.`,
      file,
    );
    return undefined;
  }
  const paramType = checker.getTypeAtLocation(param);
  return inferSchemaFromType(paramType, checker, diagnostics, file, toolId, "input", new Set<number>());
};

const inferOutputSchema = (
  node: ts.Node,
  checker: ts.TypeChecker,
  diagnostics: Diagnostic[],
  file: string,
  toolId: string,
): unknown | undefined => {
  if (!ts.isFunctionLike(node)) return undefined;
  const signature = checker.getSignatureFromDeclaration(node);
  if (!signature) return undefined;
  const returnType = checker.getReturnTypeOfSignature(signature);
  const awaited = (checker.getAwaitedType && checker.getAwaitedType(returnType)) || returnType;
  return inferSchemaFromType(awaited, checker, diagnostics, file, toolId, "output", new Set<number>());
};

export const extractTools = async (config: TinyverseConfig, options: ExtractOptions = {}): Promise<ExtractResult> => {
  const allGlobs = Array.from(new Set([...config.toolGlobs, ...(config.uiGlobs ?? [])]));
  const files = await fg(allGlobs, { absolute: true });
  const diagnostics: Diagnostic[] = [];
  const tools: ToolManifestEntry[] = [];
  const uiComponents: UiComponentManifestEntry[] = [];
  const seenIds = new Set<string>();

  const tsconfigPath = path.resolve(config.tsconfig);
  let compilerOptions: ts.CompilerOptions = {
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    esModuleInterop: true,
  };
  let tsconfigFiles: string[] = [];

  if (await fs.pathExists(tsconfigPath)) {
    const parsedConfig = loadTsConfig(tsconfigPath, diagnostics);
    if (parsedConfig) {
      compilerOptions = { ...compilerOptions, ...parsedConfig.options };
      tsconfigFiles = parsedConfig.fileNames;
    }
  } else if (!config.tsconfig.endsWith("tsconfig.json") || config.tsconfig !== "tsconfig.json") {
    addDiagnostic(
      diagnostics,
      "error",
      "TV_DIAG_TSCONFIG_MISSING",
      `tsconfig not found at ${tsconfigPath}`,
      tsconfigPath,
    );
  }

  const program = ts.createProgram({
    rootNames: Array.from(new Set([...tsconfigFiles, ...files])),
    options: compilerOptions,
  });
  const checker = program.getTypeChecker();

  for (const file of files) {
    const sourceFile = program.getSourceFile(file);
    if (!sourceFile) {
      addDiagnostic(diagnostics, "warning", "TV_DIAG_FILE_SKIP", `Unable to load ${file} from tsconfig context`, file);
      continue;
    }

    const visit = (node: ts.Node) => {
      const decorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined;
      if (decorators) {
        decorators.forEach((decorator) => {
          const toolMeta = parseToolDecorator(decorator);
          if (toolMeta) {
            const id =
              (toolMeta.id as string | undefined) ??
              (toolMeta.name as string | undefined) ??
              (ts.isFunctionLike(node) && node.name ? node.name.getText() : undefined);
            if (!id) {
              addDiagnostic(diagnostics, "error", "TV_DIAG_TOOL_ID_MISSING", `Tool missing id in ${file}`);
              return;
            }
            if (seenIds.has(id)) {
              addDiagnostic(diagnostics, "error", "TV_DIAG_TOOL_ID_DUPLICATE", `Duplicate tool id ${id} in ${file}`);
              return;
            }
            seenIds.add(id);

            const inputSchema = toolMeta.inputSchema ?? inferInputSchema(node, checker, diagnostics, file, id);
            const outputSchema = toolMeta.outputSchema ?? inferOutputSchema(node, checker, diagnostics, file, id);

            if (!inputSchema) {
              addDiagnostic(
                diagnostics,
                "error",
                "TV_DIAG_TOOL_SCHEMA_MISSING",
                `inputSchema missing for tool ${id}`,
                file,
                "Add inputSchema to the @tool decorator or ensure the first parameter has a supported type annotation.",
              );
            }

            const resourceUri = toolMeta.resourceUri as string | undefined;
            if (!resourceUri) {
              addDiagnostic(
                diagnostics,
                "warning",
                "TV_DIAG_UI_URI_MISSING",
                `Tool ${id} is missing resourceUri; ensure it maps to a ui:// namespace/resource`,
                file,
              );
            } else if (!/^ui:\/\/[A-Za-z0-9_\-]+\/[A-Za-z0-9_\-]+$/.test(resourceUri)) {
              addDiagnostic(
                diagnostics,
                "error",
                "TV_DIAG_UI_URI_INVALID",
                `Invalid resourceUri for tool ${id}: ${resourceUri}`,
                file,
                "Expected format ui://namespace/resource",
              );
            }

            tools.push({
              id,
              name: (toolMeta.name as string | undefined) ?? id,
              description: toolMeta.description as string | undefined,
              inputSchema: inputSchema ?? toolMeta.inputSchema ?? {},
              outputSchema,
              resourceUri,
              previewTemplate: toolMeta.previewTemplate as string | undefined,
            });
          }

          const uiMeta = parseUiDecorator(decorator);
          if (uiMeta) {
            const toolId = uiMeta.toolId as string | undefined;
            if (!toolId) {
              addDiagnostic(
                diagnostics,
                "error",
                "TV_DIAG_UI_TOOL_ID_MISSING",
                `UI component missing toolId in ${file}`,
                file,
              );
              return;
            }
            uiComponents.push({
              toolId,
              resourceUri: (uiMeta.resourceUri as string) ?? "",
              entry: file,
              previewTemplate: uiMeta.previewTemplate as string | undefined,
            });
          }
        });
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  // Resolve missing resourceUri for UI components from tool definitions
  for (const ui of uiComponents) {
    if (!ui.resourceUri) {
      const tool = tools.find((t) => t.id === ui.toolId);
      if (tool?.resourceUri) {
        ui.resourceUri = tool.resourceUri;
      } else {
        addDiagnostic(
          diagnostics,
          "error",
          "TV_DIAG_UI_URI_UNRESOLVED",
          `UI component for tool ${ui.toolId} is missing resourceUri and it could not be inferred from the tool definition.`,
          ui.entry,
          "Ensure the tool has a resourceUri in its @tool decorator, or provide one in the @tinyverseUi decorator.",
        );
      }
    }
  }

  const manifest: ToolManifest = {
    manifest_version: "tinyverse.tool.v0.1",
    name: config.name,
    version: config.version,
    generated_by: "tinyverse-extractor",
    generated_at: new Date().toISOString(),
    tools,
    uiComponents,
  };

  await fs.ensureDir(config.outDir);
  const manifestPath = path.join(config.outDir, "tool.manifest.json");
  await fs.writeJSON(manifestPath, manifest, { spaces: 2 });

  const success = diagnostics.length === 0 || (!options.strict && diagnostics.every((d) => d.severity === "warning"));
  if (!success) {
    logger.error({ diagnostics }, "Extraction emitted diagnostics");
  } else {
    logger.info({ manifestPath }, "Wrote tool manifest");
  }

  return { manifest, diagnostics, success };
};
