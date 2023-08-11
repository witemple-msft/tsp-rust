import { NoTarget, ModelProperty } from "@typespec/compiler";
import { HttpOperation, QueryParameterOptions } from "@typespec/http";
import { bifilter } from "./bifilter.js";
import { parseCase } from "./case.js";
import { RustContext } from "./ctx.js";
import { indent } from "./indent.js";
import { createResultInfo } from "./result.js";
import { vendoredModulePath } from "./vendored.js";
import { emitTypeReference } from "./reference.js";

export function* emitOperations(ctx: RustContext): Iterable<string> {
  for (const operation of ctx.service.operations) {
    yield* emitOperation(ctx, operation);
  }
}

export function* emitOperation(
  ctx: RustContext,
  operation: HttpOperation
): Iterable<string> {
  const operationNameCase = parseCase(operation.operation.name);
  const operationName = operationNameCase.snakeCase;

  const { parameters, body } = operation.parameters;

  const [requiredParameters, optionalParameters] = bifilter(
    parameters,
    function (param) {
      return !param.param.optional;
    }
  );

  const bodyTypeReference =
    body &&
    emitTypeReference(
      ctx,
      body.type,
      body.parameter ?? NoTarget,
      "owned",
      "models::",
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

  if (operation.responses.length > 1) debugger;

  const resultInfo = createResultInfo(
    ctx,
    operation.responses,
    operationNameCase
  );

  const params: string[] = requiredParameters.map(function createParamBinding(
    param
  ) {
    const nameCase = parseCase(param.param.name);
    const name = nameCase.snakeCase;

    const typeReference = emitTypeReference(
      ctx,
      param.param.type,
      param.param,
      "param",
      "models::",
      operationNameCase.pascalCase + nameCase.pascalCase
    );

    return `${name}: ${typeReference}`;
  });

  const pathTemplate = operation.path.replace(
    /{([^}]+)}/g,
    function recase_parameter(subst): string {
      const name = subst.slice(1, -1);
      const param = parameters.find(function (param) {
        return param.param.name === name;
      });
      if (!param) {
        throw new Error(`UNREACHABLE: ${name}`);
      }
      return `{${parseCase(param.param.name).snakeCase}}`;
    }
  );

  let method = operation.verb;

  const requiredQueryParameters = requiredParameters.filter(
    (param) => param.type === "query"
  ) as Array<QueryParameterOptions & { param: ModelProperty }>;

  const queryExpressions: string[] = [];

  const requiredQueryParts = requiredQueryParameters.map(function queryParam(
    param
  ) {
    const name = parseCase(param.param.name).snakeCase;

    if (param.format === "csv") {
      param.format;
      queryExpressions.push(`, ${name}.join(",")`);
      return `${param.name}={}`;
    } else if (param.format === "multi") {
      throw new Error("todo: query multi");
    } else if (param.format) {
      throw new Error("Unsupported query parameter format: " + param.format);
    }

    return `${param.name}={${name}}`;
  });

  const paramLine =
    queryExpressions.join("") +
    (params.length > 0 ? ", " + params.join(", ") : "") +
    bodyParam;

  const queryFormatString =
    requiredQueryParts.length > 0 ? `?${requiredQueryParts.join("&")}` : "";

  const requiredHeaderPreparation = [];
  for (const headerParam of requiredParameters.filter(
    (param) => param.type === "header"
  )) {
    const name = parseCase(headerParam.param.name).snakeCase;
    requiredHeaderPreparation.push(
      `.header(${vendoredModulePath(
        "reqwest",
        "header",
        "HeaderName"
      )}::from_static("${headerParam.name}"), ${name})`
    );
  }

  const requestPreparation = [
    `let res = ctx.client.${method.toLowerCase()}(&path)`,
  ];

  requestPreparation.push(
    ...indent(requiredHeaderPreparation),
    ...indent(requiredBodyLines),
    "  .send()",
    "  .await?;"
  );

  // prettier-ignore
  yield `pub async fn ${operationName}(ctx: &${ctx.contextTypeName}${paramLine}) -> ${resultInfo.returnType} {`;
  // prettier-ignore
  yield `  let path = format!("{}${pathTemplate}${queryFormatString}", ctx.base_url);`;
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
    yield `  let path = format!("{}${pathTemplate}${queryFormatString}", ctx.base_url${queryFormatBinding});`;
    yield "";
    yield* indent(requestPreparation);
    yield "";
    yield* indent(resultInfo.result);
    yield "}";
    yield "";
  }
}
