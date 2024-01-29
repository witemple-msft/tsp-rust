import { HttpServer } from "@typespec/http";
import { RustContext, createPathCursor } from "../ctx.js";
import { Type } from "@typespec/compiler";
import { parseCase } from "../util/case.js";
import { emitTypeReference } from "../common/reference.js";
import { referenceVendoredHostPath } from "../util/vendored.js";
import { AuthCode } from "./auth.js";

export interface ServerDescription {
  ctxLines: string[];
}

export interface ServerQueryParam {
  name: string;
  rustExpression: string;
  type: Type;
}

export function getServerDescription(
  ctx: RustContext,
  serverInfo: HttpServer | undefined,
  auth: AuthCode
): ServerDescription {
  const [baseUrlTemplate, queryTemplate] = serverInfo?.url?.split("?", 2) ?? [
    "{base_url}",
  ];

  const baseUrlArgSequence = (baseUrlTemplate.match(/{([^}]+)}/g) ?? []).map(
    function (part) {
      return `self.${part.slice(1, -1)}`;
    }
  );

  const queryArgSequence = (queryTemplate?.match(/{([^}]+)}/g) ?? []).map(
    function (part) {
      return `self.${part.slice(1, -1)}`;
    }
  );

  const cursor = createPathCursor("http");

  const ctxParams: { name: string; type: string }[] =
    serverInfo !== undefined
      ? [...serverInfo.parameters.values()].map(function (param) {
          const nameCase = parseCase(param.name);

          return {
            name: nameCase.snakeCase,
            type: emitTypeReference(
              ctx,
              param.type,
              param,
              "owned",
              cursor,
              ctx.contextTypeName + nameCase.pascalCase
            ),
          };
        })
      : [{ name: "base_url", type: "String" }];

  const ctxLines = [
    `pub struct ${ctx.contextTypeName} {`,
    `  client: ${referenceVendoredHostPath("reqwest", "Client")}`,
    ...ctxParams.map(function ({ name, type }) {
      return `  ${name}: ${type},`;
    }),
    "}",
    "",
    `impl ${ctx.contextTypeName} {`,
    // prettier-ignore
    `  pub fn new(${ctxParams.map(({ name, type }) => `${name}: ${type}`).join(", ")}) -> Self {`,
    `    Self {`,
    `      client: ${referenceVendoredHostPath("reqwest", "Client")}::new(),`,
    ...ctxParams.map(function ({ name }) {
      return `      ${name},`;
    }),
    `    }`,
    `  }`,
    "",
    "  pub fn base_url(&self) -> String {",
    // prettier-ignore
    `    format!(${JSON.stringify(baseUrlTemplate)}, ${baseUrlArgSequence.join(", ")})`,
    "  }",
    "",
    "  pub fn query(&self) -> String {",
    // prettier-ignore
    `    format!(${JSON.stringify(queryTemplate)}, ${queryArgSequence.join(", ")})`,
    "  }",
    "}",
  ];

  return {
    ctxLines,
  };
}
