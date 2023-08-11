import { parseCase } from "./case.js";
import { indent } from "./indent.js";
import { emitTypeReference } from "./reference.js";
import { referencePath, vendoredModulePath } from "./vendored.js";
export function* emitOptions(ctx) {
    if (ctx.options.length === 0) {
        return;
    }
    else {
        yield "pub mod options {";
        let idx = 0;
        for (const option of ctx.options) {
            yield* indent(emitOptionsStruct(ctx, option));
            idx += 1;
            if (idx !== ctx.options.length)
                yield "";
        }
        yield "}";
    }
}
export function* emitOptionsStruct(ctx, option) {
    const fields = option.fields.map(function generateOptionField(field) {
        const nameCase = parseCase(field.name);
        const name = nameCase.snakeCase;
        const typeReference = emitTypeReference(ctx, field.param.type, field.param, "owned", "super::models::", option.name + nameCase.pascalCase);
        return `pub ${name}: Option<${typeReference}>,`;
    });
    const anyQueryParams = option.fields.some((field) => field.type === "query");
    const anyHeaderParams = option.fields.some((field) => field.type === "header");
    yield `#[derive(Debug, Clone)]`;
    yield `pub struct ${option.name} {`;
    yield* indent(fields);
    yield "}";
    yield "";
    yield `impl Default for ${option.name} {`;
    yield `  fn default() -> Self {`;
    yield `    Self {`;
    for (const field of option.fields) {
        const name = parseCase(field.name).snakeCase;
        yield `      ${name}: None,`;
    }
    yield `    }`;
    yield `  }`;
    yield `}`;
    yield "";
    if (anyQueryParams) {
        yield `impl ${referencePath("QueryString")} for ${option.name} {`;
        yield `  fn query_string(&self) -> String {`;
        yield `    let mut parts = vec![];`;
        yield "";
        for (const field of option.fields.filter((field) => field.type === "query")) {
            const name = parseCase(field.name).snakeCase;
            yield `    if let Some(value) = &self.${name} {`;
            yield `      parts.push(format!("${field.name}={}", value));`;
            yield `    }`;
            yield "";
        }
        yield `    parts.join("&")`;
        yield `  }`;
        yield `}`;
        yield "";
    }
    if (anyHeaderParams) {
        yield `impl ${referencePath("HeaderMap")} for ${option.name} {`;
        // prettier-ignore
        yield `  fn header_map(&self) -> ${vendoredModulePath("reqwest", "header", "HeaderMap")}{`;
        // prettier-ignore
        yield `    let mut headers = ${vendoredModulePath("reqwest", "header", "HeaderMap")}::new();`;
        yield "";
        for (const field of option.fields.filter((field) => field.type === "header")) {
            // prettier-ignore
            yield `    if let Some(value) = &self.${parseCase(field.name).snakeCase} {`;
            yield "      headers.insert(";
            // prettier-ignore
            yield `        ${vendoredModulePath("reqwest", "header", "HeaderName")}::from_static("${field.name}"),`;
            // prettier-ignore
            yield `        ${vendoredModulePath("reqwest", "header", "HeaderValue")}::from_str(value.as_str()).unwrap()`;
            yield "      );";
            yield `    }`;
            yield "";
        }
        yield `    headers`;
        yield `  }`;
        yield `}`;
        yield "";
    }
}
//# sourceMappingURL=options.js.map