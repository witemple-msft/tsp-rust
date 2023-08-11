import { getProjectedName } from "@typespec/compiler";
import { parseCase } from "./case.js";
import { indent } from "./indent.js";
import { KEYWORDS } from "./keywords.js";
import { getFullyQualifiedTypeName } from "./name.js";
import { getRecordValueName, getArrayElementName, } from "./pedantry/pluralism.js";
import { vendoredModulePath } from "./vendored.js";
import { emitTypeReference } from "./reference.js";
export function* emitModels(ctx) {
    while (ctx.modelQueue.length > 0) {
        const model = ctx.modelQueue.shift();
        yield* emitModel(ctx, model);
    }
    if (ctx.synthetics.length > 0) {
        yield "";
        yield "pub mod synthetic {";
        for (const synthetic of ctx.synthetics) {
            yield* indent(emitModel(ctx, synthetic.underlying, synthetic.name));
        }
        yield "}";
    }
}
export function* emitModel(ctx, model, altName) {
    const modelNameCase = parseCase(model.name);
    if (model.name === "" && !altName) {
        throw new Error("Internal Error: Anonymous model with no altName");
    }
    const fields = [...model.properties.values()].flatMap(function (field) {
        const nameCase = parseCase(field.name);
        const basicName = nameCase.snakeCase;
        const typeReference = emitTypeReference(ctx, field.type, field, "owned", "", modelNameCase.pascalCase + nameCase.pascalCase);
        const fullType = field.optional
            ? `Option<${typeReference}>`
            : typeReference;
        const projectedName = getProjectedName(ctx.program, field, "json") ?? field.name;
        const name = KEYWORDS.has(basicName) ? `r#${basicName}` : basicName;
        return [
            ...(basicName !== projectedName
                ? ["#[serde(rename = " + JSON.stringify(projectedName) + ")]"]
                : []),
            `pub ${name}: ${fullType},`,
        ];
    });
    const structName = model.name === "" ? altName : modelNameCase.pascalCase;
    // prettier-ignore
    yield `#[derive(Debug, Clone, PartialEq, ${vendoredModulePath("serde", "Deserialize")}, ${vendoredModulePath("serde", "Serialize")})]`;
    yield `#[serde(crate = "${vendoredModulePath("serde")}")]`;
    yield `pub struct ${structName} {`;
    yield* indent(fields);
    yield "}";
    yield "";
}
export function isWellKnownModel(ctx, type) {
    const fullName = getFullyQualifiedTypeName(type);
    return fullName === "TypeSpec.Record" || fullName === "TypeSpec.Array";
}
export function emitWellKnownModel(ctx, type, disposition, prefix, preferredAlternativeName) {
    switch (type.name) {
        case "Record": {
            const arg = type.templateMapper?.args[0];
            return `${disposition === "owned" ? "" : "&"}std::collections::HashMap<String, ${emitTypeReference(ctx, arg, type, 
            // TODO: manually setting this to "owned" so that the hashmap can own it, but we probably want borrowed forms
            // of maps in general
            "owned", prefix, getRecordValueName(preferredAlternativeName))}>`;
        }
        case "Array": {
            const arg2 = type.templateMapper?.args[0];
            const innerReference = emitTypeReference(ctx, arg2, type, "owned", prefix, getArrayElementName(preferredAlternativeName));
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
//# sourceMappingURL=model.js.map