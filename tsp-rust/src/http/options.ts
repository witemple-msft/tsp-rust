import { HttpOperationParameter, QueryParameterOptions } from "@typespec/http";
import { parseCase } from "../util/case.js";
import {
  RustContext,
  OptionsStructDefinition,
  createPathCursor,
} from "../ctx.js";
import { indent } from "../util/indent.js";
import { emitTypeReference } from "../common/reference.js";
import {
  referenceHostPath,
  referenceVendoredHostPath,
} from "../util/vendored.js";

export function* emitOptions(ctx: RustContext): Iterable<string> {
  if (ctx.options.length === 0) {
    return;
  } else {
    yield "pub mod options {";
    yield "  use super::super::models;";
    yield "";

    let idx = 0;
    for (const option of ctx.options) {
      yield* indent(emitOptionsStruct(ctx, option));
      idx += 1;
      if (idx !== ctx.options.length) yield "";
    }
    yield "}";
  }
}

export function* emitOptionsStruct(
  ctx: RustContext,
  option: OptionsStructDefinition
): Iterable<string> {
  const cursor = createPathCursor("http", "options");

  const fields = option.fields.map(function generateOptionField(field) {
    const nameCase = parseCase(field.name);
    const name = nameCase.snakeCase;
    const typeReference = emitTypeReference(
      ctx,
      field.param.type,
      field.param,
      "owned",
      cursor,
      option.name + nameCase.pascalCase
    );

    return `pub ${name}: Option<${typeReference}>,`;
  });

  const anyQueryParams = option.fields.some((field) => field.type === "query");
  const anyHeaderParams = option.fields.some(
    (field) => field.type === "header"
  );

  yield `#[derive(Debug, Clone, Default)]`;
  yield `pub struct ${option.name} {`;
  yield* indent(fields);
  yield "}";
  yield "";

  if (anyQueryParams) {
    yield `impl ${referenceHostPath("QueryString")} for ${option.name} {`;
    yield `  fn query_string(&self) -> String {`;
    yield `    let mut parts = vec![];`;
    yield "";

    for (const field of option.fields.filter(
      (field) => field.type === "query"
    ) as Extract<HttpOperationParameter, QueryParameterOptions>[]) {
      const name = parseCase(field.name).snakeCase;
      yield `    if let Some(value) = &self.${name} {`;
      switch (field.format) {
        case undefined:
          yield `      parts.push(format!("${field.name}={}", value));`;
          break;
        case "csv":
          yield `      use ${referenceVendoredHostPath(
            "itertools",
            "Itertools"
          )};`;
          yield `      parts.push(format!("${field.name}={}", value.iter().join(",")));`;
          break;
        default:
          throw new Error(
            "Unsupported query parameter format: " + field.format
          );
      }
      yield `    }`;
      yield "";
    }

    yield `    parts.join("&")`;
    yield `  }`;
    yield `}`;
    yield "";
  }

  if (anyHeaderParams) {
    yield `impl ${referenceHostPath("HeaderMap")} for ${option.name} {`;
    // prettier-ignore
    yield `  fn header_map(&self) -> ${referenceVendoredHostPath("reqwest", "header", "HeaderMap")}{`;
    // prettier-ignore
    yield `    let mut headers = ${referenceVendoredHostPath("reqwest", "header", "HeaderMap")}::new();`;
    yield "";

    for (const field of option.fields.filter(
      (field) => field.type === "header"
    )) {
      // prettier-ignore
      yield `    if let Some(value) = &self.${parseCase(field.name).snakeCase} {`;
      yield "      headers.insert(";
      // prettier-ignore
      yield `        ${referenceVendoredHostPath("reqwest", "header", "HeaderName")}::from_static("${field.name.toLowerCase()}"),`;
      // prettier-ignore
      yield `        ${referenceVendoredHostPath("reqwest", "header", "HeaderValue")}::from_str(value.as_str()).unwrap()`;
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
