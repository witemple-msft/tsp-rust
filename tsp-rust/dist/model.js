import { getDoc, getEncode, getProjectedName, isArrayModelType, } from "@typespec/compiler";
import { parseCase } from "./case.js";
import { indent } from "./indent.js";
import { KEYWORDS } from "./keywords.js";
import { getFullyQualifiedTypeName } from "./name.js";
import { getRecordValueName, getArrayElementName, } from "./pedantry/pluralism.js";
import { referencePath, vendoredModulePath } from "./vendored.js";
import { emitTypeReference, isValueLiteralType } from "./reference.js";
import { getHeaderFieldName, isHeader } from "@typespec/http";
export function* emitModel(ctx, model, cursor, altName) {
    const isTemplate = model.templateMapper !== undefined;
    const modelNameCase = parseCase(isTemplate
        ? model.name +
            model
                .templateMapper.args.map((a) => "name" in a ? String(a.name) : "")
                .join("_")
        : model.name);
    if (model.name === "" && !altName) {
        throw new Error("Internal Error: Anonymous model with no altName");
    }
    const modelRecursionPoints = getModelRecursion(ctx, model);
    const fieldSpecifications = [...model.properties.values()].filter((f) => !isValueLiteralType(f.type));
    const defaultMode = getDefaultMode(ctx, fieldSpecifications);
    const hasHeaderFields = fieldSpecifications.some((f) => isHeader(ctx.program, f));
    const bodyLines = [];
    const requiresAs = fieldSpecifications.some((f) => f.type.kind === "Scalar" && getEncode(ctx.program, f));
    const fields = fieldSpecifications.flatMap(function (field) {
        const nameCase = parseCase(field.name);
        const basicName = nameCase.snakeCase;
        // if (
        //   field.type === ctx.program.resolveTypeReference("TypeSpec.utcDateTime")[0]
        // )
        //   debugger;
        const requiresBox = modelRecursionPoints.includes(field.name);
        if (isValueLiteralType(field.type))
            return [];
        const typeReference = emitTypeReference(ctx, field.type, field, "owned", cursor, modelNameCase.pascalCase + nameCase.pascalCase);
        const boxedTypeReference = requiresBox
            ? `Box<${typeReference}>`
            : typeReference;
        const fullType = field.optional
            ? `Option<${boxedTypeReference}>`
            : boxedTypeReference;
        const projectedName = getProjectedName(ctx.program, field, "json") ?? field.name;
        const name = KEYWORDS.has(basicName) ? `r#${basicName}` : basicName;
        const encodingAsLines = field.type.kind === "Scalar"
            ? getEncodingAsLines(ctx, field)
            : [];
        if (hasHeaderFields && !isHeader(ctx.program, field)) {
            bodyLines.push(...(basicName !== projectedName
                ? ["#[serde(rename = " + JSON.stringify(projectedName) + ")]"]
                : []), ...(field.optional
                ? ['#[serde(skip_serializing_if = "Option::is_none")]']
                : []), ...encodingAsLines, `pub ${name}: ${fullType},`);
        }
        return [
            ...(!hasHeaderFields
                ? [
                    ...(basicName !== projectedName
                        ? ["#[serde(rename = " + JSON.stringify(projectedName) + ")]"]
                        : []),
                    ...(field.optional
                        ? ['#[serde(skip_serializing_if = "Option::is_none")]']
                        : []),
                    ...encodingAsLines,
                ]
                : []),
            `pub ${name}: ${fullType},`,
        ];
    });
    const structName = model.name === "" ? altName : modelNameCase.pascalCase;
    const derives = ["Debug", "Clone", "PartialEq"];
    if (defaultMode === "derive") {
        derives.push("Default");
    }
    const deriveString = derives.join(", ");
    if (hasHeaderFields) {
        yield `#[derive(${deriveString})]`;
    }
    else {
        if (requiresAs) {
            // prettier-ignore
            yield `#[${vendoredModulePath("serde_with", "serde_as")}(crate = "${vendoredModulePath("serde_with")}")]`;
        }
        // prettier-ignore
        yield `#[derive(${deriveString}, ${vendoredModulePath("serde", "Deserialize")}, ${vendoredModulePath("serde", "Serialize")})]`;
        yield `#[serde(crate = "${vendoredModulePath("serde")}")]`;
    }
    const doc = getDoc(ctx.program, model);
    if (doc) {
        yield `#[doc = ${JSON.stringify(doc)}]`;
    }
    yield `pub struct ${structName} {`;
    yield* indent(fields);
    yield "}";
    if (hasHeaderFields) {
        yield "";
        yield "#[allow(non_camel_case_types)]";
        if (requiresAs) {
            // prettier-ignore
            yield `#[${vendoredModulePath("serde_with", "serde_as")}(crate = ${vendoredModulePath("serde_with")})]`;
        }
        yield `#[derive(Debug, Clone, PartialEq, ${vendoredModulePath("serde", "Deserialize")}, ${vendoredModulePath("serde", "Serialize")})]`;
        yield `#[serde(crate = "${vendoredModulePath("serde")}")]`;
        yield `pub struct ${structName}__Body {`;
        yield* indent(bodyLines);
        yield "}";
        const headerFieldSpecs = fieldSpecifications.filter((f) => isHeader(ctx.program, f));
        yield "#[allow(non_camel_case_types)]";
        yield `#[derive(Debug, Clone, PartialEq)]`;
        yield "#[allow(non_camel_case_types)]";
        yield `pub struct ${structName}__Headers {`;
        for (const h of headerFieldSpecs) {
            const basicName = parseCase(h.name).snakeCase;
            const name = KEYWORDS.has(basicName) ? `r#${basicName}` : basicName;
            yield `  pub ${name}: Option<String>,`;
        }
        yield "}";
        yield "";
        yield `impl ${referencePath("FromHeaders")} for ${structName}__Headers {`;
        // prettier-ignore
        yield `  fn from_headers(headers: &${vendoredModulePath("reqwest", "header", "HeaderMap")}) -> Self {`;
        yield `    Self {`;
        for (const h of headerFieldSpecs) {
            const basicName = parseCase(h.name).snakeCase;
            const name = KEYWORDS.has(basicName) ? `r#${basicName}` : basicName;
            // prettier-ignore
            yield `      ${name}: headers.get(${JSON.stringify(getHeaderFieldName(ctx.program, h) ?? h.name)}).map(|v| v.to_str().unwrap().to_string()),`;
        }
        yield "    }";
        yield "  }";
        yield "}";
        // prettier-ignore
        yield `impl ${referencePath("FromResponseParts")} for ${structName} {`;
        yield `  type Body = ${structName}__Body;`;
        yield `  type Headers = ${structName}__Headers;`;
        yield "";
        // prettier-ignore
        yield `  fn from_response_parts(body: Self::Body, headers: Self::Headers) -> Self {`;
        yield "    Self {";
        for (const field of fieldSpecifications) {
            const nameCase = parseCase(field.name);
            const basicName = nameCase.snakeCase;
            if (isValueLiteralType(field.type))
                continue;
            const name = KEYWORDS.has(basicName) ? `r#${basicName}` : basicName;
            if (isHeader(ctx.program, field)) {
                const headerName = (getHeaderFieldName(ctx.program, field) ?? nameCase.kebabCase).toLowerCase();
                // prettier-ignore
                const baseExpr = `headers.${name}`;
                const isOptional = field.optional;
                const expr = isOptional ? baseExpr : `${baseExpr}.unwrap()`;
                yield `      ${name}: ${expr},`;
            }
            else {
                yield `      ${name}: body.${name},`;
            }
        }
        yield "    }";
        yield "  }";
        yield "}";
    }
    yield "";
}
export function isWellKnownModel(ctx, type) {
    const fullName = getFullyQualifiedTypeName(type);
    return fullName === "TypeSpec.Record" || fullName === "TypeSpec.Array";
}
export function emitWellKnownModel(ctx, type, disposition, cursor, preferredAlternativeName) {
    switch (type.name) {
        case "Record": {
            const arg = type.templateMapper?.args[0];
            return `${disposition === "owned" ? "" : "&"}std::collections::HashMap<String, ${emitTypeReference(ctx, arg, type, 
            // TODO: manually setting this to "owned" so that the hashmap can own it, but we probably want borrowed forms
            // of maps in general
            "owned", cursor, getRecordValueName(preferredAlternativeName))}>`;
        }
        case "Array": {
            const arg2 = type.templateMapper?.args[0];
            const innerReference = emitTypeReference(ctx, arg2, type, "owned", cursor, getArrayElementName(preferredAlternativeName));
            if (disposition === "owned")
                return `Vec<${innerReference}>`;
            else {
                return `&[${innerReference}]`;
            }
        }
        default:
            throw new Error(`UNREACHABLE: ${type.name}`);
    }
}
/**
 * Returns the names of all fields that need to be boxed in order to avoid an
 * infinite struct.
 */
function getModelRecursion(ctx, model) {
    const queue = [...model.properties].map(([name, type]) => ({
        type: type,
        field: name,
    }));
    const recursiveFields = new Set();
    const visited = new Set();
    while (queue.length > 0) {
        const { type, field } = queue.shift();
        if (type === model) {
            recursiveFields.add(field);
            continue;
        }
        const nextTypes = [];
        switch (type.kind) {
            case "Scalar":
            case "Enum":
            case "Boolean":
            case "String":
            case "Number":
            case "Intrinsic":
            case "Decorator":
            case "Function":
            case "EnumMember":
            case "FunctionParameter":
            case "Namespace":
            case "TemplateParameter":
            case "Projection":
                break;
            case "Union":
                nextTypes.push(...type.variants.values());
                break;
            case "ModelProperty":
                nextTypes.push(type.type);
                break;
            case "Model":
                nextTypes.push(...type.properties.values());
                break;
            case "Operation":
                nextTypes.push(type.parameters);
                nextTypes.push(type.returnType);
                type.sourceOperation && nextTypes.push(type.sourceOperation);
                break;
            case "Interface":
                nextTypes.push(...type.operations.values());
                break;
            case "UnionVariant":
                nextTypes.push(type.type);
                break;
            case "Object":
                nextTypes.push(...Object.entries(type.properties).map(([, v]) => v));
                break;
            case "Tuple":
                nextTypes.push(...type.values);
                break;
            case "StringTemplate":
                nextTypes.push(...type.spans);
                break;
            case "StringTemplateSpan":
                nextTypes.push(type.type);
                break;
            default:
                throw new Error(`UNREACHABLE: ${type.kind}`);
        }
        for (const type of nextTypes.filter((type) => !visited.has(type))) {
            visited.add(type);
            queue.push({ type, field });
        }
    }
    return [...recursiveFields];
}
function getDefaultMode(ctx, fields) {
    if (fields.every((f) => f.optional ||
        (f.type.kind === "Model" && isArrayModelType(ctx.program, f.type)))) {
        return "derive";
    }
    return undefined;
}
function getEncodingAsLines(ctx, p) {
    const encoding = getEncode(ctx.program, p);
    if (!encoding)
        return [];
    if (p.type === ctx.program.resolveTypeReference("TypeSpec.utcDateTime")[0] &&
        encoding.type === ctx.program.resolveTypeReference("TypeSpec.int32")[0] &&
        encoding.encoding === "unixTimestamp") {
        // We represent this in JSON as a number
        debugger;
        return [
            // prettier-ignore
            `#[serde_as(as = "${vendoredModulePath("serde_with", "TimestampSeconds")}<i64>")]`,
        ];
    }
    return [];
}
//# sourceMappingURL=model.js.map