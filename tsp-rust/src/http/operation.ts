import {
  NoTarget,
  ModelProperty,
  Type,
  StringLiteral,
  NumericLiteral,
  BooleanLiteral,
} from "@typespec/compiler";
import { HttpOperation, QueryParameterOptions } from "@typespec/http";
import { bifilter } from "../util/bifilter.js";
import { parseCase } from "../util/case.js";
import { RustContext, createPathCursor } from "../ctx.js";
import { indent } from "../util/indent.js";
import { createResultInfo } from "./result.js";
import { referenceVendoredHostPath } from "../util/vendored.js";
import { emitTypeReference, isValueLiteralType } from "../common/reference.js";
import { AuthCode } from "./auth.js";

export function* emitHttpOperations(
  ctx: RustContext,
  auth: AuthCode,
  mutResponseLines: string[]
): Iterable<string> {
  for (const operation of ctx.httpService.operations) {
    yield* emitOperation(ctx, operation, auth, mutResponseLines);
  }
}

export function* emitOperation(
  ctx: RustContext,
  operation: HttpOperation,
  auth: AuthCode,
  mutResponseLines: string[]
): Iterable<string> {
  const cursor = createPathCursor("http");
  const operationNameCase = parseCase(operation.operation.name);
  const operationName = operationNameCase.snakeCase;

  const { parameters: operationParams, body } = operation.parameters;

  const [requiredOperationParameters, optionalParameters] = bifilter(
    operationParams,
    function (param) {
      return !param.param.optional;
    }
  );

  const [hardSettings, requiredParameters] = bifilter(
    requiredOperationParameters,
    function (param) {
      return isValueLiteralType(param.param.type);
    }
  );

  const bodyTypeReference =
    body &&
    emitTypeReference(
      ctx,
      body.type,
      body.parameter ?? NoTarget,
      "owned",
      cursor,
      operationNameCase.pascalCase + "RequestBody"
    );
  const bodyIsRequired = body && !body.parameter?.optional;
  const bodyIsOptional = body && body.parameter?.optional;
  const bodyFieldName =
    body && parseCase(body.parameter?.name ?? "body").snakeCase;
  const bodyParam = bodyIsRequired
    ? `, ${bodyFieldName}: ${bodyTypeReference}`
    : "";
  const requiredBodyLines = bodyIsRequired ? [`.json(&${bodyFieldName})`] : [];

  const resultInfo = createResultInfo(
    ctx,
    operation.responses,
    operationNameCase
  );

  for (const synth of resultInfo.syntheticResponses) {
    mutResponseLines.push(...synth.lines, "");
  }

  const params: string[] = requiredParameters.map(
    function createParamBinding(param) {
      const nameCase = parseCase(param.param.name);
      const name = nameCase.snakeCase;

      const typeReference = emitTypeReference(
        ctx,
        param.param.type,
        param.param,
        "param",
        cursor,
        operationNameCase.pascalCase + nameCase.pascalCase
      );

      return `${name}: ${typeReference}`;
    }
  );

  const pathTemplate = operation.path.replace(
    /{([^}]+)}/g,
    function recase_parameter(subst): string {
      const name = subst.slice(1, -1);
      const param = operationParams.find(function (param) {
        return param.param.name === name;
      });
      if (!param || param.type !== "path") {
        throw new Error(`UNREACHABLE: ${name}`);
      }

      if (hardSettings.includes(param)) {
        return settingToString(param.param.type);
      }

      return `{${parseCase(param.param.name).snakeCase}}`;
    }
  );

  let method = operation.verb;

  const requiredQueryParameters = requiredParameters.filter(
    (param) => param.type === "query"
  ) as Array<QueryParameterOptions & { param: ModelProperty }>;

  const queryExpressions: string[] = [];

  const requiredQueryParts = requiredQueryParameters.map(
    function queryParam(param) {
      const name = parseCase(param.param.name).snakeCase;

      if (param.format === "csv") {
        queryExpressions.push(`${name}.iter().join(",")`);
        return `${param.name}={}`;
      } else if (param.format === "multi") {
        queryExpressions.push(
          `${name}.iter().map(|v| format!("${param.name}={}", v)).join("&")`
        );
      } else if (param.format) {
        throw new Error("Unsupported query parameter format: " + param.format);
      }

      return `${param.name}={${name}}`;
    }
  );

  const paramLine =
    // queryExpressions.join("") +
    (params.length > 0 ? ", " + params.join(", ") : "") + bodyParam;

  const requiredHeaderPreparation = [];
  for (const headerParam of requiredParameters.filter(
    (param) => param.type === "header"
  )) {
    const name = parseCase(headerParam.param.name).snakeCase;
    requiredHeaderPreparation.push(
      `.header(${referenceVendoredHostPath(
        "reqwest",
        "header",
        "HeaderName"
      )}::from_static("${headerParam.name.toLowerCase()}"), ${name})`
    );
  }

  for (const setting of hardSettings) {
    switch (setting.type) {
      case "query":
        requiredQueryParts.push(
          `${setting.name}=${settingToString(setting.param.type)}`
        );
        break;
      case "header":
        requiredHeaderPreparation.push(
          `.header(${referenceVendoredHostPath(
            "reqwest",
            "header",
            "HeaderName"
          )}::from_static("${setting.name.toLowerCase()}"), ${JSON.stringify(
            settingToString(setting.param.type)
          )})`
        );
        break;
      case "path":
        // Do nothing -- path hard settings are handled in path construction above.
        break;
    }
  }

  const queryFormatString =
    requiredQueryParts.length > 0 ? `?${requiredQueryParts.join("&")}` : "";

  requiredHeaderPreparation.push(
    ...auth.headers.map(
      ([name, expr]) =>
        `.header(${referenceVendoredHostPath(
          "reqwest",
          "header",
          "HeaderName"
        )}::from_static("${name.toLowerCase()}"), ${expr})`
    )
  );

  const requestPreparation = [
    `let res = ctx.client.${method.toLowerCase()}(&path)`,
  ];

  requestPreparation.push(
    ...indent(requiredHeaderPreparation),
    ...indent(requiredBodyLines),
    "  .send()",
    "  .await?;"
  );

  const queryExpressionLine =
    queryExpressions.length > 0 ? `, ${queryExpressions.join(", ")}` : "";

  // prettier-ignore
  yield `pub async fn ${operationName}(ctx: &${ctx.contextTypeName}${paramLine}) -> ${resultInfo.returnType} {`;
  // prettier-ignore
  yield `  let path = format!("{}${pathTemplate}${queryFormatString}", ctx.base_url${queryExpressionLine});`;
  yield "";
  // prettier-ignore
  yield* indent(requestPreparation);
  yield "";
  yield* indent(resultInfo.result);
  yield "}";
  yield "";

  if (optionalParameters.length > 0 || bodyIsOptional) {
    const optionsTypeName = operationNameCase.pascalCase + "Options";

    const finalOptionalParameters = [...optionalParameters];

    if (bodyIsOptional) {
      finalOptionalParameters.push({
        name: bodyFieldName!,
        param: body.parameter!,
        type: "body" as never,
      });
    }

    ctx.options.push({
      name: optionsTypeName,
      fields: finalOptionalParameters,
    });

    const optionalQueryParameters = optionalParameters.filter(
      (param) => param.type === "query"
    ) as Array<QueryParameterOptions & { param: ModelProperty }>;

    const allQueryParts = [...requiredQueryParts];

    if (optionalQueryParameters.length > 0) {
      allQueryParts.push("{}");
    }

    const queryFormatBinding =
      optionalQueryParameters.length > 0 ? ", options.query_string()" : "";
    const queryFormatString =
      allQueryParts.length > 0 ? `?${allQueryParts.join("&")}` : "";

    const requestPreparation = bodyIsOptional
      ? [
          `let mut req = ctx.client.${method.toLowerCase()}(&path);`,
          `if let Some(body) = &options.${bodyFieldName} {`,
          `  req = req.json(body);`,
          `};`,
          "",
          `let res = req`,
        ]
      : [
          `let res = ctx.client.${method.toLowerCase()}(&path)`,
          ...indent(requiredBodyLines),
        ];

    requestPreparation.push(...indent(requiredHeaderPreparation));

    if (optionalParameters.some((param) => param.type === "header")) {
      requestPreparation.push("  .headers(options.header_map())");
    }

    requestPreparation.push("  .send()", "  .await?;");

    // Generate an equivalent _with_options function
    // prettier-ignore
    yield `pub async fn ${operationName}_with_options(ctx: &${ctx.contextTypeName}${paramLine}, options: &options::${optionsTypeName}) -> ${resultInfo.returnType} {`;
    yield `  let path = format!("{}${pathTemplate}${queryFormatString}", ctx.base_url${queryExpressionLine}${queryFormatBinding});`;
    yield "";
    yield* indent(requestPreparation);
    yield "";
    yield* indent(resultInfo.result);
    yield "}";
    yield "";
  }
}

function isPrintableLiteralType(
  type: Type
): type is StringLiteral | NumericLiteral | BooleanLiteral {
  switch (type.kind) {
    case "String":
    case "Number":
    case "Boolean":
      return true;
    default:
      return false;
  }
}

function settingToString(type: Type): string {
  if (!isPrintableLiteralType(type)) {
    throw new Error("Attempted to print unprintable type: " + type.kind);
  }

  return String(type.value);
}
