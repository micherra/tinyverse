import path from "path";
import fs from "fs-extra";
import fg from "fast-glob";
import ts from "typescript";
import { getLogger } from "@tinyverse/core";
const logger = getLogger();
const addDiagnostic = (list, severity, code, message, location, suggestion, details) => {
    list.push({ severity, code, message, location, suggestion, details });
};
const loadTsConfig = (tsconfigPath, diagnostics) => {
    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (configFile.error) {
        addDiagnostic(diagnostics, "error", "TV_DIAG_TSCONFIG_INVALID", `Failed to read tsconfig at ${tsconfigPath}`, tsconfigPath, undefined, ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
        return null;
    }
    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(tsconfigPath));
    if (parsed.errors.length > 0) {
        const first = parsed.errors[0];
        addDiagnostic(diagnostics, "error", "TV_DIAG_TSCONFIG_INVALID", `tsconfig parse error at ${tsconfigPath}`, tsconfigPath, undefined, ts.flattenDiagnosticMessageText(first.messageText, "\n"));
        return null;
    }
    return { options: parsed.options, fileNames: parsed.fileNames };
};
const evaluateLiteral = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
        return node.text;
    if (ts.isNumericLiteral(node))
        return Number(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword)
        return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword)
        return false;
    if (node.kind === ts.SyntaxKind.NullKeyword)
        return null;
    if (ts.isArrayLiteralExpression(node))
        return node.elements.map(evaluateLiteral);
    if (ts.isObjectLiteralExpression(node)) {
        const obj = {};
        for (const prop of node.properties) {
            if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop))
                continue;
            const name = ts.isShorthandPropertyAssignment(prop)
                ? prop.name.text
                : ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)
                    ? prop.name.text
                    : undefined;
            if (!name)
                continue;
            const value = ts.isShorthandPropertyAssignment(prop)
                ? prop.name.text
                : evaluateLiteral(prop.initializer);
            obj[name] = value;
        }
        return obj;
    }
    return undefined;
};
const parseToolDecorator = (decorator) => {
    const expr = decorator.expression;
    if (!ts.isCallExpression(expr))
        return null;
    const decoratorName = ts.isIdentifier(expr.expression) ? expr.expression.text : undefined;
    if (decoratorName !== "tool")
        return null;
    const [arg] = expr.arguments;
    if (!arg || !ts.isObjectLiteralExpression(arg))
        return null;
    const parsed = evaluateLiteral(arg);
    return parsed && typeof parsed === "object" ? parsed : null;
};
const isStringLiteralUnion = (type) => {
    if (!type.isUnion())
        return null;
    const values = [];
    for (const t of type.types) {
        if ((t.flags & ts.TypeFlags.StringLiteral) !== 0) {
            values.push(t.value);
        }
        else if ((t.flags & ts.TypeFlags.Undefined) !== 0 || (t.flags & ts.TypeFlags.Null) !== 0) {
            continue;
        }
        else {
            return null;
        }
    }
    return values.length > 0 ? values : null;
};
const inferSchemaFromType = (type, checker, diagnostics, file, toolId, pathLabel, seen) => {
    const typeId = type.id;
    if (typeId && seen.has(typeId)) {
        return undefined;
    }
    if (typeId)
        seen.add(typeId);
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
        const tupleElements = checker.getTypeArguments(type);
        const itemSchemas = tupleElements
            .map((t, idx) => inferSchemaFromType(t, checker, diagnostics, file, toolId, `${pathLabel}[${idx}]`, seen))
            .filter(Boolean);
        if (itemSchemas.length === tupleElements.length && itemSchemas.length > 0) {
            return { type: "array", items: itemSchemas.length === 1 ? itemSchemas[0] : { anyOf: itemSchemas } };
        }
        return { type: "array" };
    }
    if (checker.isArrayType(type)) {
        const typeArgs = checker.getTypeArguments(type);
        const element = typeArgs[0];
        const items = element
            ? inferSchemaFromType(element, checker, diagnostics, file, toolId, `${pathLabel}[]`, seen)
            : undefined;
        return items ? { type: "array", items } : { type: "array" };
    }
    if (type.getFlags() & ts.TypeFlags.Object) {
        const properties = {};
        const required = [];
        for (const prop of checker.getPropertiesOfType(type)) {
            const decl = prop.valueDeclaration ?? prop.declarations?.[0];
            const propType = checker.getTypeOfSymbolAtLocation(prop, decl ?? type);
            const schema = inferSchemaFromType(propType, checker, diagnostics, file, toolId, `${pathLabel}.${prop.name}`, seen);
            if (schema) {
                properties[prop.name] = schema;
            }
            const isOptional = Boolean(prop.getFlags() & ts.SymbolFlags.Optional) ||
                (decl && "questionToken" in decl && decl.questionToken !== undefined);
            if (!isOptional) {
                required.push(prop.name);
            }
        }
        const result = { type: "object", properties };
        if (required.length > 0) {
            result.required = required;
        }
        return result;
    }
    addDiagnostic(diagnostics, "warning", "TV_DIAG_SCHEMA_INFER_UNSUPPORTED", `Unsupported type "${typeString}" while inferring schema for ${toolId} at ${pathLabel}. Provide an explicit schema in the decorator.`, file);
    return undefined;
};
const inferInputSchema = (node, checker, diagnostics, file, toolId) => {
    if (!("parameters" in node) || !node.parameters?.length) {
        return { type: "object", properties: {} };
    }
    const param = node.parameters[0];
    if (!param.type) {
        addDiagnostic(diagnostics, "warning", "TV_DIAG_SCHEMA_INFER_MISSING_TYPE", `Cannot infer input schema for ${toolId}; first parameter lacks a type annotation.`, file);
        return undefined;
    }
    const paramType = checker.getTypeAtLocation(param);
    return inferSchemaFromType(paramType, checker, diagnostics, file, toolId, "input", new Set());
};
const inferOutputSchema = (node, checker, diagnostics, file, toolId) => {
    if (!ts.isFunctionLike(node))
        return undefined;
    const signature = checker.getSignatureFromDeclaration(node);
    if (!signature)
        return undefined;
    const returnType = checker.getReturnTypeOfSignature(signature);
    const awaited = (checker.getAwaitedType && checker.getAwaitedType(returnType)) || returnType;
    return inferSchemaFromType(awaited, checker, diagnostics, file, toolId, "output", new Set());
};
export const extractTools = async (config, options = {}) => {
    const toolFiles = await fg(config.toolGlobs, { absolute: true });
    const diagnostics = [];
    const tools = [];
    const seenIds = new Set();
    const tsconfigPath = path.resolve(config.tsconfig);
    let compilerOptions = {};
    let tsconfigFiles = [];
    if (!(await fs.pathExists(tsconfigPath))) {
        addDiagnostic(diagnostics, "error", "TV_DIAG_TSCONFIG_MISSING", `tsconfig not found at ${tsconfigPath}`, tsconfigPath);
    }
    else {
        const parsedConfig = loadTsConfig(tsconfigPath, diagnostics);
        if (parsedConfig) {
            compilerOptions = parsedConfig.options;
            tsconfigFiles = parsedConfig.fileNames;
        }
    }
    const program = ts.createProgram({
        rootNames: Array.from(new Set([...tsconfigFiles, ...toolFiles])),
        options: compilerOptions,
    });
    const checker = program.getTypeChecker();
    for (const file of toolFiles) {
        const sourceFile = program.getSourceFile(file);
        if (!sourceFile) {
            addDiagnostic(diagnostics, "warning", "TV_DIAG_FILE_SKIP", `Unable to load ${file} from tsconfig context`, file);
            continue;
        }
        const visit = (node) => {
            const decorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined;
            if (decorators) {
                decorators.forEach((decorator) => {
                    const meta = parseToolDecorator(decorator);
                    if (meta) {
                        const id = meta.id ?? meta.name ?? (ts.isFunctionLike(node) && node.name ? node.name.getText() : undefined);
                        if (!id) {
                            addDiagnostic(diagnostics, "error", "TV_DIAG_TOOL_ID_MISSING", `Tool missing id in ${file}`);
                            return;
                        }
                        if (seenIds.has(id)) {
                            addDiagnostic(diagnostics, "error", "TV_DIAG_TOOL_ID_DUPLICATE", `Duplicate tool id ${id} in ${file}`);
                            return;
                        }
                        seenIds.add(id);
                        const inputSchema = meta.inputSchema ?? inferInputSchema(node, checker, diagnostics, file, id);
                        const outputSchema = meta.outputSchema ?? inferOutputSchema(node, checker, diagnostics, file, id);
                        if (!inputSchema) {
                            addDiagnostic(diagnostics, "error", "TV_DIAG_TOOL_SCHEMA_MISSING", `inputSchema missing for tool ${id}`, file, "Add inputSchema to the @tool decorator or ensure the first parameter has a supported type annotation.");
                        }
                        if (!meta.resourceUri) {
                            addDiagnostic(diagnostics, "warning", "TV_DIAG_UI_URI_MISSING", `Tool ${id} is missing resourceUri; ensure it maps to a ui:// namespace/resource`, file);
                        }
                        else if (!/^ui:\/\/[A-Za-z0-9_\-]+\/[A-Za-z0-9_\-]+$/.test(meta.resourceUri)) {
                            addDiagnostic(diagnostics, "error", "TV_DIAG_UI_URI_INVALID", `Invalid resourceUri for tool ${id}: ${meta.resourceUri}`, file, "Expected format ui://namespace/resource");
                        }
                        tools.push({
                            id,
                            name: meta.name ?? id,
                            description: meta.description,
                            inputSchema: inputSchema ?? meta.inputSchema ?? {},
                            outputSchema,
                            resourceUri: meta.resourceUri,
                        });
                    }
                });
            }
            ts.forEachChild(node, visit);
        };
        visit(sourceFile);
    }
    const manifest = {
        manifest_version: "tinyverse.tool.v0.1",
        name: config.name,
        version: config.version,
        generated_by: "tinyverse-extractor",
        generated_at: new Date().toISOString(),
        tools,
    };
    await fs.ensureDir(config.outDir);
    const manifestPath = path.join(config.outDir, "tool.manifest.json");
    await fs.writeJSON(manifestPath, manifest, { spaces: 2 });
    const success = diagnostics.length === 0 || (!options.strict && diagnostics.every((d) => d.severity === "warning"));
    if (!success) {
        logger.error({ diagnostics }, "Extraction emitted diagnostics");
    }
    else {
        logger.info({ manifestPath }, "Wrote tool manifest");
    }
    return { manifest, diagnostics, success };
};
//# sourceMappingURL=index.js.map