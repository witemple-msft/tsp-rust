import {
  HttpOperationBody,
  HttpOperationResponse,
  HttpOperationResponseContent,
  StatusCode,
  getHeaderFieldName,
  isHeader,
} from "@typespec/http";
import { RustContext, createPathCursor } from "../ctx.js";
import { bifilter } from "../util/bifilter.js";
import { ModelProperty, isErrorModel } from "@typespec/compiler";
import { indent } from "../util/indent.js";
import { ReCase, parseCase } from "../util/case.js";
import { emitTypeReference } from "../common/reference.js";
import {
  referenceHostPath,
  referenceVendoredHostPath,
} from "../util/vendored.js";
import { KEYWORDS } from "../common/keywords.js";

export interface ResultInfo {
  readonly returnType: string;
  readonly result: string[];
  readonly syntheticResponses: SyntheticResponseModelInfo[];
}

export function createResultInfo(
  ctx: RustContext,
  responses: HttpOperationResponse[],
  operationCase: ReCase
): ResultInfo {
  const cursor = createPathCursor("http");

  const [successResponses, errorResponses] = bifilter(
    responses,
    function isErrorResponse(resp) {
      return !isErrorModel(ctx.program, resp.type);
    }
  );

  if (
    successResponses.length !== 1 ||
    errorResponses.length > 1 ||
    successResponses[0].responses.length > 1 ||
    (errorResponses.length > 0 && errorResponses[0].responses.length > 1)
  ) {
    // TODO: synthesize effective union of responses
    throw new Error("Multiple responses not supported");
  }

  const successResponse = successResponses[0].responses[0];
  const errorResponse: HttpOperationResponseContent | undefined =
    errorResponses[0]?.responses[0];

  const successResponseBodyType = successResponse.body?.type;
  const successResponseBodyIsModel = successResponseBodyType?.kind === "Model";
  const extrinsicSuccessHeaders = Object.values(
    successResponse.headers ?? {}
  ).filter(
    (h) =>
      !successResponseBodyIsModel ||
      ![...(successResponseBodyType?.properties.values() ?? [])].includes(h)
  );

  // TODO: this whole extrinsic header nonsense is really fragile and jank. If we ever have multiple
  // of these things it seems like it's going to be a huge pain in the ass to unravel how this works
  // with processing of status code.
  //
  // An intrinsic header is one that appears inside the model that is decorated with @body. If that happens,
  // we don't actually need to synthesize a response type. We can just use the body type if there aren't any
  // extrinsic headers.
  //
  // Extrinsic ones appear separately from the body, so we synthesize a container struct that holds the body
  // in addition to the extrinsic header values.

  const successExtrinsicResponse =
    extrinsicSuccessHeaders.length > 0 &&
    synthesizeResponseWithHeaders(
      ctx,
      extrinsicSuccessHeaders,
      successResponse.body,
      operationCase,
      false
    );

  const errorResponseBody = errorResponse?.body?.type;
  const errorResponseBodyIsModel = errorResponseBody?.kind === "Model";
  const extrinsicErrorHeaders = Object.values(
    errorResponse?.headers ?? {}
  ).filter(
    (h) =>
      !errorResponseBodyIsModel ||
      ![...(errorResponseBody?.properties.values() ?? [])].includes(h)
  );

  const errorExtrinsicResponse =
    extrinsicErrorHeaders.length > 0 &&
    synthesizeResponseWithHeaders(
      ctx,
      extrinsicErrorHeaders,
      errorResponse!.body,
      operationCase,
      true
    );

  // Cases:
  // - Response has headers - must synthesize a response type that merges the body
  // - Response has no headers
  //   - Response has no body, return "()"
  //   - Response has a body, return the body type directly -- could be breaking if
  //     headers are added later and the response shape changes

  const successTypeReference = successExtrinsicResponse
    ? "response::" + successExtrinsicResponse.typeName
    : successResponse.body === undefined
      ? "()"
      : emitTypeReference(
          ctx,
          successResponse.body.type,
          successResponse.body.type,
          "owned",
          cursor,
          operationCase.pascalCase + "Response"
        );

  // prettier-ignore

  const output = [
    "let status = res.status();",
    "",
    "match status.as_u16() {"
  ];

  for (const response of responses) {
    const exprOrPattern = codeToExprOrPattern(response.statusCode);
    output.push(`  ${exprOrPattern} => {`);

    if (response.responses.length !== 1) {
      throw new Error(
        `Number of responses not supported, expected 1 got ${response.responses.length}`
      );
    }

    const responseContent = response.responses[0];

    if (
      responseContent.body &&
      !responseContent.body.contentTypes?.includes("application/json")
    ) {
      throw new Error(
        "Response does not support content-type: application/json"
      );
    }

    const isError = isErrorModel(ctx.program, response.type);

    if (isError && errorExtrinsicResponse) {
      // prettier-ignore
      output.push(`    Err(${referenceHostPath("OperationError", "Service")}(${exprOrPattern}, result::${errorExtrinsicResponse.typeName}::from_response(res).await)`);
    } else if (!isError && successExtrinsicResponse) {
      // prettier-ignore
      output.push(`    Ok(response::${successExtrinsicResponse.typeName}::from_response(res).await)`);
    } else {
      output.push(
        ...indent(
          indent(
            emitResultProcessingCode(
              ctx,
              responseContent,
              operationCase,
              isError,
              exprOrPattern
            )
          )
        )
      );
    }

    output.push("  },");
  }

  const isExhaustive = responses.some(function (response) {
    return response.statusCode === "*";
  });

  if (!isExhaustive) {
    output.push("  status => {");
    // prettier-ignore
    output.push(`    Err(${referenceHostPath("OperationError", "UnexpectedStatus")}(status, res))`);
    output.push("  },");
  }

  output.push("}");

  const errorTypeReference = errorExtrinsicResponse
    ? "response::" + errorExtrinsicResponse.typeName
    : errorResponse?.body
      ? emitTypeReference(
          ctx,
          errorResponse.body.type,
          errorResponse.body.type,
          "owned",
          cursor,
          operationCase.pascalCase + "ErrorResponseBody"
        )
      : "()";

  const returnType = referenceHostPath(
    `OperationResult<${successTypeReference}, ${errorTypeReference}>`
  );

  return {
    returnType,
    result: output,
    syntheticResponses: [
      successExtrinsicResponse,
      errorExtrinsicResponse,
    ].filter((v): v is SyntheticResponseModelInfo => !!v),
  };
}

function codeToExprOrPattern(code: StatusCode): string {
  if (code === "*") {
    return "status";
  }

  return code;
}

function* emitResultProcessingCode(
  ctx: RustContext,
  response: HttpOperationResponseContent,
  operationCase: ReCase,
  error: boolean,
  exprOrPattern: string
): Iterable<string> {
  const cursor = createPathCursor("http");
  if (response.body) {
    let returnTypeReference = emitTypeReference(
      ctx,
      response.body?.type,
      response.body?.type,
      "owned",
      cursor,
      operationCase.pascalCase + error ? "ErrorResponseBody" : "ResponseBody"
    );

    const hasHeaderFields =
      response.body?.type.kind === "Model" &&
      [...response.body?.type.properties.values()].some((f) =>
        isHeader(ctx.program, f)
      );

    const bodyTypeReference = hasHeaderFields
      ? // prettier-ignore
        `<${returnTypeReference} as ${referenceHostPath("FromResponseParts")}>::Body`
      : returnTypeReference;

    if (hasHeaderFields) {
      yield "let headers = {";
      yield `  use ${referenceHostPath("FromHeaders")};`;
      // prettier-ignore
      yield `  <${returnTypeReference} as ${referenceHostPath("FromResponseParts")}>::Headers::from_headers(res.headers())`;
      yield "};";
      yield "";
    }

    yield `let text = res.text().await?;`;
    yield `${referenceVendoredHostPath(
      "log",
      "debug"
    )}!("Response body: {}", text);`;
    // prettier-ignore
    yield `let body = ${referenceVendoredHostPath("serde_json", "from_str")}::<${bodyTypeReference}>(&text)?;`;
    yield "";

    let valReference = "body";

    if (hasHeaderFields) {
      // prettier-ignore
      yield `let result = <${returnTypeReference} as ${referenceHostPath("FromResponseParts")}>::from_response_parts(body, headers);`;

      valReference = "result";
    }

    // prettier-ignore
    if (error) {
      yield `Err(${referenceHostPath("OperationError", "Service")}(${exprOrPattern}, ${valReference}))`;
    } else {
      yield `Ok(${valReference})`;
    }
  } else {
    if (error) {
      // prettier-ignore
      yield `Err(${referenceHostPath("OperationError", "Service")}(${exprOrPattern}, ()))`;
    } else {
      yield "Ok(())";
    }
  }
}

interface SyntheticResponseModelInfo {
  typeName: string;
  lines: string[];
}

function synthesizeResponseWithHeaders(
  ctx: RustContext,
  extrinsicHeaders: ModelProperty[],
  body: HttpOperationBody | undefined,
  operationCase: ReCase,
  error: boolean
): SyntheticResponseModelInfo {
  const cursor = createPathCursor("http", "result");

  const typeName =
    operationCase.pascalCase + (error ? "ErrorResponse" : "Response");

  const lines: string[] = [`pub struct ${typeName} {`];

  // TODO: return a result
  const implLines: string[] = [
    `impl ${typeName} {`,
    // prettier-ignore
    `  pub async fn from_response(res: ${referenceVendoredHostPath("reqwest", "Response")}) -> Self {`,
    "    Self {",
  ];

  for (const header of extrinsicHeaders) {
    const nameCase = parseCase(header.name);
    const basicName = nameCase.snakeCase;

    const headerType = emitTypeReference(
      ctx,
      header.type,
      header.type,
      "owned",
      cursor,
      operationCase.pascalCase + "Result" + nameCase.pascalCase
    );

    const name = KEYWORDS.has(basicName) ? `r#${basicName}` : basicName;

    const headerName = getHeaderFieldName(ctx.program, header);

    let headerExpr = `res.headers().get(${JSON.stringify(
      headerName
    )}).map(|v| v.to_str().unwrap().to_string())`;

    headerExpr = !header.optional ? `${headerExpr}.unwrap()` : headerExpr;

    lines.push(`  pub ${name}: ${headerType},`);
    // prettier-ignore
    implLines.push(`      ${name}: ${headerExpr},`)
  }

  if (body) {
    const bodyFieldName =
      "name" in body.type &&
      typeof body.type.name === "string" &&
      body.type.name
        ? body.type.name
        : "body";

    const bodyTypeReference = emitTypeReference(
      ctx,
      body.type,
      body.type,
      "owned",
      cursor,
      typeName + "Body"
    );

    const hasHeaderFields =
      body.type.kind === "Model" &&
      [...body.type.properties.values()].some((p) => isHeader(ctx.program, p));

    lines.push(`  pub ${bodyFieldName}: ${bodyTypeReference},`);

    if (!hasHeaderFields) {
      implLines.push(`      ${bodyFieldName}: res.json().await.unwrap()`);
    } else {
      implLines.push(
        `      ${bodyFieldName}: async move {`,
        "        let headers = {",
        `          use ${referenceHostPath("FromHeaders")};`,
        //prettier-ignore
        `            <${bodyTypeReference} as ${referenceHostPath("FromResponseParts")}>::Headers::from_headers(res.headers())`,
        "        };",
        "",
        `        let body = res.json::<${bodyTypeReference}>().await?;`,
        "",
        // prettier-ignore
        `        <${bodyTypeReference} as ${referenceHostPath("FromResponseParts")}>::from_response_parts(body, headers)`,
        "      }.await"
      );
    }
  }

  // prettier-ignore
  lines.push(
    "}",
    "",
    ...implLines,
    "    }",
    "  }",
    "}"
  );

  return {
    lines,
    typeName,
  };
}
