import {
  JSONSchemaType,
  Type,
  isArrayModelType,
  isErrorModel,
} from "@typespec/compiler";
import {
  Module,
  PathCursor,
  RustContext,
  completePendingDeclarations,
} from "../ctx.js";
import {
  HttpOperation,
  HttpOperationParameter,
  HttpOperationRequestBody,
  HttpOperationResponse,
  HttpOperationResponseContent,
  HttpServer,
  HttpService,
  HttpStatusCodeRange,
  getHeaderFieldOptions,
  getHttpService,
  getServers,
  isBody,
  isContentTypeHeader,
  isHeader,
  isStatusCode,
} from "@typespec/http";
import {
  referenceHostPath,
  referenceVendoredHostPath,
} from "../util/vendored.js";
import { UnimplementedError } from "../util/error.js";
import { registerFeature } from "../feature.js";
import { parseCase } from "../util/case.js";
import { bifilter } from "../util/bifilter.js";
import { emitTypeReference, isValueLiteralType } from "../common/reference.js";
import { SplitReturnType, splitReturnType } from "../common/interface.js";
import { indent } from "../util/indent.js";
import { getRustScalar } from "../common/scalar.js";
import { createOrGetModuleForNamespace } from "../common/namespace.js";
import { getRustLiteralTypeAndValue } from "../common/model.js";

declare global {
  interface RustEmitterFeature {
    http: HttpOptions;
  }
}

export interface HttpOptions {}

export interface HttpContext extends RustContext {
  httpService: HttpService;
  httpOptions: HttpOptions;
  httpModule: Module;
  servers: HttpServer[];

  impls: Impl[];
}

const HttpTraits = ["FromParts", "FromResponse", "Responder"] as const;
type HttpTrait = (typeof HttpTraits)[number];

interface TraitArgs {
  FromParts: [];
  FromResponse: [body: Type];
  Responder: [isBody: boolean];
}

const impls = new Map<HttpTrait, Set<Type | string>>(
  HttpTraits.map((trait) => [trait, new Set()])
);

interface Impl<T extends HttpTrait = HttpTrait> {
  trait: T;
  for: Type | [PathCursor, string];
  args: TraitArgs[T];
}

function impl<T extends HttpTrait>(
  ctx: HttpContext,
  trait: T,
  for_: Type | [PathCursor, string],
  ...args: TraitArgs[T]
) {
  const traitImpls = impls.get(trait)!;

  let key: Type | string = for_ as Type;
  if (Array.isArray(for_)) {
    key = for_[0].item(for_[1]);
  }

  if (!traitImpls.has(key)) {
    traitImpls.add(key);
    ctx.impls.push({ trait, for: for_, args });
  }
}

const HttpOptionsSchema: JSONSchemaType<RustEmitterFeature["http"]> = {
  type: "object",
  properties: {},
  required: [],
  nullable: true,
};

registerFeature("http", HttpOptionsSchema, emitHttp);

async function emitHttp(ctx: RustContext, options: RustEmitterFeature["http"]) {
  const [httpService, diagnostics] = getHttpService(
    ctx.program,
    ctx.service.type
  );

  const diagnosticsAreError = diagnostics.some((d) => d.severity === "error");

  if (diagnosticsAreError) {
    console.warn(
      "HTTP emit disabled because getHttpService returned diagnostics."
    );
    return;
  }

  const servers = getServers(ctx.program, ctx.service.type) ?? [];

  const httpModule: Module = {
    name: "http",
    cursor: ctx.rootModule.cursor.enter("http"),

    declarations: [],

    visibility: "pub",
    inline: false,
  };

  ctx.rootModule.declarations.push(httpModule);

  const httpContext: HttpContext = {
    ...ctx,
    httpService,
    httpModule,
    servers,
    httpOptions: options,
    impls: [],
  };

  const operationsModule: Module = {
    name: "operations",
    cursor: httpModule.cursor.enter("operations"),

    declarations: [],

    visibility: "pub",
    inline: false,
  };

  httpModule.declarations.push(operationsModule);

  emitRawClient(httpContext, httpService, operationsModule);
  emitRawServer(httpContext, httpService, operationsModule);

  const implsModule: Module = {
    name: "_impls",
    cursor: httpModule.cursor.enter("impls"),

    declarations: [],

    visibility: "",
    inline: true,
  };

  httpModule.declarations.push(implsModule);

  for (const impl of httpContext.impls) {
    implsModule.declarations.push([...emitImpl(httpContext, impl)]);
  }
}

function emitRawClient(
  ctx: HttpContext,
  httpService: HttpService,
  operationsModule: Module
) {
  const clientRawModule: Module = {
    name: "client_raw",
    cursor: operationsModule.cursor.enter("client_raw"),

    declarations: [],

    visibility: "pub",
    inline: true,
  };

  operationsModule.declarations.push(clientRawModule);

  for (const operation of httpService.operations) {
    clientRawModule.declarations.push([
      ...emitRawClientOperation(ctx, operation, clientRawModule.cursor),
    ]);
  }
}

const ITERTOOLS_FORMATS = new Set(["csv", "tsv", "ssv", "pipes"]);

function* emitRawClientOperation(
  ctx: HttpContext,
  httpOperation: HttpOperation,
  cursor: PathCursor
): Iterable<string> {
  const { operation, verb, responses } = httpOperation;
  const operationNameCase = parseCase(operation.name);

  const [settings, parameters] = bifilter(
    operation.parameters.properties.values(),
    (param) => isValueLiteralType(param.type)
  );

  const parameterLines = parameters.map(function formParameter(param) {
    const parameterNameCase = parseCase(param.name);
    const name = parameterNameCase.snakeCase;

    const typeReference = emitTypeReference(
      ctx,
      param.type,
      param,
      "param",
      cursor,
      operationNameCase.pascalCase + parameterNameCase.pascalCase
    );

    return `${name}: ${typeReference},`;
  });

  const [returnType, errorType] = splitReturnType(
    ctx,
    operation.returnType,
    cursor,
    operationNameCase.pascalCase
  );

  yield "#[allow(unused)]";
  yield* getOperationPrototype(
    operationNameCase.snakeCase,
    parameterLines,
    returnType.typeReference,
    errorType.typeReference
  );

  // Make sure the signature is complete before we start emitting the body, since we cannot
  // accurately name types nested within the operation signature.
  completePendingDeclarations(ctx);

  const requiresItertools = (
    httpOperation.parameters.parameters as Array<
      Extract<HttpOperationParameter, { format?: string | undefined }>
    >
  ).some((param) => param.format && ITERTOOLS_FORMATS.has(param.format));

  if (requiresItertools) {
    yield `  use ${referenceVendoredHostPath("itertools", "Itertools")};`;
  }

  yield `  use ${referenceHostPath("http", "Error")} as HttpError;`;
  yield "";

  yield* indent(emitOperationRequest(ctx, httpOperation, cursor));

  const requiresOutputContentType = httpOperation.responses.some((resp) =>
    resp.responses.some(
      (respContents) => (respContents.body?.contentTypes.length ?? 0) > 0
    )
  );

  // prettier-ignore
  yield `  let response = ${referenceHostPath("http", "send_request")}(service, request).await?;`;
  yield "  #[allow(unused_variables)]";
  yield "  let (parts, body) = response.into_parts();";
  yield "";
  yield "  let status_code = parts.status.as_u16();";
  yield "";

  // TODO: we exit the function early if no content-type is present, but we probably want UnexpectedStatus to prevail
  // in cases like 404 where we may get no body and no content-type if the server sends 403/404/429 etc.

  if (requiresOutputContentType) {
    yield `  let content_type = parts`;
    yield `    .headers`;
    yield `    .get("content-type")`;
    yield `    .map(|h| String::from(h.to_str().expect("failed to convert header contents to String")))`;
    // prettier-ignore
    yield `    .ok_or_else(|| ${referenceHostPath("http", "Error", "UnexpectedContentType")}(`;
    yield `        None,`;
    // prettier-ignore
    yield `        parts.clone(),`;
    yield `    ))?;`;
    yield "";
  }
  yield "  match status_code {";

  yield* indent(indent(emitResponseCases(ctx, responses, cursor)));

  yield "  }";
  yield "}";
  yield "";
}

function getOperationPrototype(
  name: string,
  parameters: string[],
  returnType: string,
  errorType: string
): string[] {
  return [
    `pub async fn ${name}<`,
    `  ResponseBody: ${referenceVendoredHostPath("http_body", "Body")},`,
    `  S: ::tsp_rust::http::Service<ResponseBody>,`,
    ">(",
    "  service: &mut S,",
    ...parameters,
    ") -> Result<",
    `  ${returnType},`,
    `  ${referenceHostPath("http", "Error")}<`,
    "    ResponseBody,",
    "    S::Error,",
    `    ${errorType},`,
    "  >,",
    "> {",
  ];
}

const DEFAULT_CONTENT_TYPE = "application/json";

function* emitOperationRequest(
  ctx: HttpContext,
  operation: HttpOperation,
  cursor: PathCursor
): Iterable<string> {
  const {
    verb,
    path,
    parameters: { parameters, body },
  } = operation;

  // prettier-ignore
  yield `let request = ${referenceVendoredHostPath("http", "Request")}::builder()`;
  // prettier-ignore
  yield `  .method(${referenceVendoredHostPath("http", "Method", verb.toUpperCase())})`;

  const queryParameters: [string, string][] = [];
  const pathFormatArgs: string[] = [];

  for (const parameter of parameters) {
    if (isContentTypeHeader(ctx.program, parameter.param)) continue;

    switch (parameter.type) {
      case "header": {
        const expr = formatParameterArgument(ctx, parameter);
        // prettier-ignore
        yield `  .header(${JSON.stringify(parameter.name)}, ${expr})`;
        break;
      }
      case "query": {
        const expr = formatParameterArgument(ctx, parameter);

        queryParameters.push([parameter.name, expr]);

        break;
      }
      case "path": {
        const expr = (
          parameter.param.type.kind === "Scalar"
            ? getRustScalar(ctx.program, parameter.param.type, parameter.param)
                .paramTemplate
            : "{}"
        ).replace("{}", parameter.name);

        // TODO: is this enough? For most common path types, like string or numerics, it should be fine, but I harbor
        // doubts about what this means for more complex types like arrays.
        pathFormatArgs.push(`ToString::to_string(${expr})`);
        break;
      }
      default:
        throw new Error(
          `UNREACHABLE: parameter type ${
            (parameter as HttpOperationParameter).type
          }`
        );
    }
  }

  let pathTemplate = path.replace(/{([^}]+)}/g, "{}");

  if (pathTemplate.endsWith("/")) {
    pathTemplate = pathTemplate.slice(0, -1);
  }

  const queryTemplate =
    queryParameters.length > 0
      ? `?${queryParameters.map(([name, _]) => `${name}={}`).join("&")}`
      : "";

  const formatArgs =
    pathFormatArgs.length + queryParameters.length > 0
      ? ", " +
        pathFormatArgs
          .concat(queryParameters.map(([, expr]) => expr))
          .join(", ")
      : "";

  const uriString =
    pathFormatArgs.length + queryTemplate.length > 0
      ? `format!(${JSON.stringify(pathTemplate + queryTemplate)}${formatArgs})`
      : JSON.stringify(operation.path);

  // prettier-ignore
  yield `  .uri(${uriString})`;

  if (body) {
    const { contentTypes, parameter, type } = body;

    if (contentTypes.length > 1) {
      throw new UnimplementedError(
        `dynamic request content type: [${contentTypes.join(", ")}]`
      );
    }

    const contentType = contentTypes[0] ?? DEFAULT_CONTENT_TYPE;

    yield `  .header("content-type", ${JSON.stringify(contentType)})`;

    switch (contentType) {
      case "application/json": {
        if (!parameter) {
          throw new UnimplementedError(
            "serialization of deep body references is not yet supported"
          );
        }

        yield `  .body(${referenceHostPath("http", "Body", "new")}(Box::pin(`;
        yield `    ${referenceVendoredHostPath("futures", "stream", "once")}(`;
        // prettier-ignore
        yield `      ${referenceVendoredHostPath("futures", "future", "ready")}(Ok(`;
        // prettier-ignore
        yield `        ${referenceVendoredHostPath("http_body", "Frame", "data")}(`;
        // prettier-ignore
        yield `          ${referenceVendoredHostPath("serde_json", "to_vec")}(&${parameter.name})`;
        // prettier-ignore
        yield `            .map_err(HttpError::Serialize)?`;
        yield `            .into(),`;
        yield `        ),`;
        yield `      )),`;
        yield `    ),`;
        yield `  )))`;

        break;
      }
      case "application/merge-patch+json": {
        yield '  .body(unimplemented!("application/merge-patch+json"))';
        break;
      }
      case "multipart/form-data": {
        yield '  .body(unimplemented!("multipart/form-data"))';
        break;
      }
      default:
        throw new UnimplementedError(
          `serialization for HTTP request content-type '${contentType}' is not yet supported.`
        );
    }
  } else {
    const body = `${referenceHostPath(
      "http",
      "Body"
    )}::new(Box::pin(${referenceVendoredHostPath(
      "futures",
      "stream",
      "empty"
    )}()))`;
    yield `  .body(${body})`;
  }
  yield "  .unwrap();";
  yield "";
}

function formatParameterArgument(
  ctx: HttpContext,
  parameter: HttpOperationParameter
): string {
  const parameterName = parseCase(parameter.param.name).snakeCase;

  const exprTemplate =
    parameter.param.type.kind === "Scalar"
      ? getRustScalar(ctx.program, parameter.param.type, parameter.param)
          .paramTemplate
      : "{}";

  const expr = exprTemplate.replace("{}", parameterName);

  if (parameter.type === "path") return expr;

  const { format } = parameter;

  if (!format) return expr;

  switch (format) {
    case "simple":
    case "csv": {
      return `&${expr}.join(",")`;
    }
    case "ssv": {
      return `&${expr}.join(" ")`;
    }
    case "tsv": {
      return `&${expr}.join("\\t")`;
    }
    case "pipes": {
      return `&${expr}.join("|")`;
    }
    case "multi":
    case "form":
      throw new UnimplementedError("multi/form parameter format");
    default:
      throw new Error(`UNREACHABLE: parameter format '${format}'`);
  }
}

function* emitResponseCases(
  ctx: HttpContext,
  responses: HttpOperationResponse[],
  cursor: PathCursor
): Iterable<string> {
  const hasWildcardStatus = responses.some((r) => r.statusCodes === "*");

  for (const response of responses) {
    const statusPattern = getStatusCodePattern(response.statusCodes);

    yield `${statusPattern} => {`;

    for (const responseContent of response.responses) {
      yield* indent(
        emitResponseContent(ctx, response, responseContent, cursor)
      );
    }

    yield "}";
  }

  if (!hasWildcardStatus) {
    // prettier-ignore
    yield `code => Err(HttpError::UnexpectedStatus(code, parts))`;
  }
}

function* emitResponseContent(
  ctx: HttpContext,
  response: HttpOperationResponse,
  responseContent: HttpOperationResponseContent,
  cursor: PathCursor
): Iterable<string> {
  const { body } = responseContent;

  if (body) {
    // TODO: we cannot recover the altname here, and we rely on the body having been visited
    // before this point, but is that guaranteed?
    let bodyTypeReference = emitTypeReference(
      ctx,
      body.type,
      body.type,
      "owned",
      cursor,
      "**unreachable**"
    );

    // prettier-ignore
    // yield `let body: ${bodyTypeReference} = ${referenceHostPath("http", "deserialize_body")}(body).await?;`;

    // yield "";

    yield "match content_type.as_str() {";

    for (const contentType of body.contentTypes) {
      yield `  ${JSON.stringify(contentType)} => {`;
      yield* indent(
        indent(
          emitBodyDeserialization(
            ctx,
            response,
            contentType,
            bodyTypeReference,
            body,
            cursor
          )
        )
      );
      yield "  },";
    }

    // prettier-ignore
    yield `  _ => Err(HttpError::UnexpectedContentType(Some(content_type), parts)),`;

    yield "}";
  } else {
    const isErrorResponse = isErrorModel(ctx.program, response.type);

    const outputTypeReference = emitTypeReference(
      ctx,
      response.type,
      response.type,
      "owned",
      cursor,
      "**unreachable**"
    );

    impl(ctx, "FromParts", response.type);

    const fromParts = `${referenceHostPath(
      "http",
      "FromParts"
    )}::from_parts(parts)`;

    if (isErrorResponse) {
      yield `Err(HttpError::Operation(${fromParts}))`;
    } else {
      yield `Ok(${fromParts})`;
    }
  }
}

function* emitBodyDeserialization(
  ctx: HttpContext,
  response: HttpOperationResponse,
  contentType: string,
  bodyTypeReference: string,
  body: HttpOperationRequestBody,
  cursor: PathCursor
): Iterable<string> {
  const isErrorResponse = isErrorModel(ctx.program, response.type);

  const bodyIsResponse = body.type === response.type;

  const responseValue = bodyIsResponse
    ? "body"
    : `${referenceHostPath(
        "http",
        "FromResponse"
      )}::from_response(body, parts)`;

  if (!bodyIsResponse) {
    impl(ctx, "FromResponse", response.type, body.type);
  }

  switch (contentType) {
    case "application/json": {
      // prettier-ignore
      yield `let body: ${bodyTypeReference} = ${referenceHostPath("http", "deserialize_body")}(body).await?;`;
      yield "";
      if (isErrorResponse) {
        yield `Err(HttpError::Operation(${responseValue}))`;
      } else {
        yield `Ok(${responseValue})`;
      }
      break;
    }
    default:
      throw new UnimplementedError(
        `deserialization for HTTP response content type '${contentType}' is not yet supported.`
      );
  }
}

function getStatusCodePattern(
  code: number | HttpStatusCodeRange | "*"
): string {
  if (code === "*") {
    return "status";
  } else if (typeof code === "number") {
    return String(code);
  } else {
    // TODO: is this exclusive or inclusive?
    return `${code.start}..=${code.end}`;
  }
}

function* emitImpl(ctx: HttpContext, impl: Impl): Iterable<string> {
  const cursor = ctx.httpModule.cursor.enter("_impls");

  switch (impl.trait) {
    case "FromParts":
    case "FromResponse":
      yield* emitFromResponseOrHeaderImpl(
        ctx,
        impl as Impl<"FromResponse" | "FromParts">,
        cursor
      );
      break;
    case "Responder":
      yield* emitResponderImpl(ctx, impl as Impl<"Responder">, cursor);
      break;
    default:
      throw new Error(`Unreachable: ${impl.trait satisfies never}`);
  }
}

function* emitFromResponseOrHeaderImpl(
  ctx: HttpContext,
  impl: Impl<"FromParts" | "FromResponse">,
  cursor: PathCursor
): Iterable<string> {
  const typeReference = Array.isArray(impl.for)
    ? cursor.pathTo(...impl.for)
    : emitTypeReference(
        ctx,
        impl.for,
        impl.for,
        "owned",
        cursor,
        "**unreachable**"
      );

  if (Array.isArray(impl.for)) {
    // TODO: need to be able to reconstruct the variants from impl.for
    throw new UnimplementedError("Composite response reconstruction.");
  }

  if (impl.for.kind === "Intrinsic") return [];

  const trait = referenceHostPath("http", impl.trait);

  const args = impl.args.map((arg) =>
    emitTypeReference(ctx, arg, arg, "owned", cursor, "**unreachable**")
  );

  const generics = args.length > 0 ? `<${args.join(", ")}>` : "";

  yield `impl ${trait}${generics} for ${typeReference} {`;
  yield "  #[allow(unused)]";

  switch (impl.trait) {
    case "FromParts": {
      // prettier-ignore
      yield `  fn from_parts(parts: ${referenceVendoredHostPath("http", "response", "Parts")}) -> Self {`;
      break;
    }
    case "FromResponse": {
      // prettier-ignore
      yield `  fn from_response(body: ${args[0]}, parts: ${referenceVendoredHostPath("http", "response", "Parts")}) -> Self {`;
      break;
    }
    default: {
      throw new Error(`UNREACHABLE: HTTP trait ${impl.trait}`);
    }
  }

  yield* indent(indent(emitConstructor(ctx, impl.for, cursor)));

  yield `  }`;

  yield "}";
}

function* emitConstructor(
  ctx: HttpContext,
  type: Type,
  cursor: PathCursor
): Iterable<string> {
  // TODO: support recursive construction for deeply-nested http data
  switch (type.kind) {
    case "Model": {
      yield "Self {";
      for (const property of type.properties.values()) {
        // Skip settings
        if (isValueLiteralType(property.type)) continue;

        const propertyCase = parseCase(property.name);
        const name = propertyCase.snakeCase;

        if (isBody(ctx.program, property)) {
          if (property.optional) {
            yield `  ${name}: Some(body),`;
          } else {
            if (name === "body") {
              yield "body,";
            } else {
              yield `  ${name}: body,`;
            }
          }
        } else if (isHeader(ctx.program, property)) {
          const headerInfo = getHeaderFieldOptions(ctx.program, property);

          if (property.optional) {
            // prettier-ignore
            yield `  ${name}: parts.headers.get(${JSON.stringify(headerInfo.name)}).map(|h| h.to_str().unwrap().into()),`;
          } else {
            // TODO: make this whole thing return a Result
            // prettier-ignore
            yield `  ${name}: parts.headers.get(${JSON.stringify(headerInfo.name)}).map(|h| h.to_str().unwrap()).unwrap().into(),`;
          }
        } else if (isStatusCode(ctx.program, property)) {
          if (property.optional) {
            yield `  ${name}: Some(parts.status.as_u16().into()),`;
          } else {
            yield `  ${name}: parts.status.as_u16().into(),`;
          }
        } else {
          throw new UnimplementedError(
            `response constructor cannot instantiate inoperative property '${property.name}'`
          );
        }
      }
      yield "}";
      break;
    }
    case "Intrinsic":
      switch (type.name) {
        case "void": {
          yield "()";
          break;
        }
        default: {
          throw new UnimplementedError(
            `response constructor for intrinsic type '${type.name}'`
          );
        }
      }
      break;
    default:
      throw new UnimplementedError(
        `response constructor for type kind '${type.kind}'`
      );
  }
}

function* emitResponderImpl(
  ctx: HttpContext,
  impl: Impl<"Responder">,
  cursor: PathCursor
): Iterable<string> {
  const typeIsBody = impl.args[0];

  const typeReference = Array.isArray(impl.for)
    ? cursor.pathTo(...impl.for)
    : emitTypeReference(
        ctx,
        impl.for,
        impl.for,
        "owned",
        cursor,
        "**unreachable**"
      );

  if (Array.isArray(impl.for)) {
    // TODO: this is getting very complicated!
    throw new UnimplementedError("Composite response output.");
  }

  if (impl.for.kind === "Intrinsic") return [];

  if (impl.for.kind === "Model" && isArrayModelType(ctx.program, impl.for))
    return [];

  yield `impl ${referenceHostPath("http", "Responder")} for ${typeReference} {`;
  yield `  fn to_response<B: ${referenceVendoredHostPath(
    "http_body",
    "Body"
  )}, E: std::error::Error>(self) -> Result<`;
  yield `    ${referenceVendoredHostPath(
    "http",
    "Response"
  )}<${referenceHostPath("http", "Body")}>,`;
  yield `    ${referenceHostPath("http", "ServerError")}<B, E>`;
  yield `  > {`;

  switch (impl.for.kind) {
    case "Model": {
      if (typeIsBody) {
        // prettier-ignore
        yield `    let response = ${referenceVendoredHostPath("http", "Response")}::builder()`;
        yield `      .status(200u16)`;
        yield `      .header("content-type", "application/json")`;
        yield `      .body(`;
        yield `        ${referenceHostPath(
          "http",
          "serialize_json_body"
        )}(&self)`;
        yield `                .map_err(${referenceHostPath(
          "http",
          "ServerError",
          "Serialize"
        )})?`;
        yield `      )`;
        yield `      .unwrap();`;
        yield "";

        yield "    Ok(response)";
        yield "  }";
        yield "}";

        return;
      }

      // prettier-ignore
      yield `    let response = ${referenceVendoredHostPath("http", "Response")}::builder()`;

      const defaultStatusCode = isErrorModel(ctx.program, impl.for)
        ? "400u16"
        : "200u16";

      const responseData: {
        body?: string[];
        headers: [string, string][];
        status: string;
      } = { headers: [], status: defaultStatusCode };

      for (const property of impl.for.properties.values()) {
        const propertyNameCase = parseCase(property.name);

        if (isStatusCode(ctx.program, property)) {
          if (isValueLiteralType(property.type)) {
            responseData.status = `Self::${propertyNameCase.upper.snakeCase} as u16`;
          } else {
            responseData.status = `self.${propertyNameCase.snakeCase} as u16`;
          }
        } else if (isHeader(ctx.program, property)) {
          const headerInfo = getHeaderFieldOptions(ctx.program, property);

          if (isValueLiteralType(property.type)) {
            const [, value] = getRustLiteralTypeAndValue(property.type);
            responseData.headers.push([headerInfo.name, value]);
          } else {
            responseData.headers.push([
              headerInfo.name,
              `self.${propertyNameCase.snakeCase}`,
            ]);
          }
        } else if (isBody(ctx.program, property)) {
          if (isValueLiteralType(property.type)) {
            throw new UnimplementedError("literal body responder");
          } else {
            // TODO: assumes JSON
            responseData.headers.unshift([
              "content-type",
              JSON.stringify("application/json"),
            ]);
            responseData.body = [
              `${referenceHostPath("http", "serialize_json_body")}(&self.${
                propertyNameCase.snakeCase
              })`,
              `  .map_err(${referenceHostPath(
                "http",
                "ServerError",
                "Serialize"
              )})?`,
            ];
          }
        }
      }

      yield `      .status(${responseData.status})`;

      for (const [name, expr] of responseData.headers) {
        yield `      .header(${JSON.stringify(name)}, ${expr})`;
      }

      if (responseData.body) {
        yield `      .body(`;
        yield* indent(indent(indent(responseData.body)));
        yield `      )`;
      } else {
        yield* indent(
          indent([
            `.body(${referenceHostPath("http", "Body", "new")}(Box::pin(`,
            `  ${referenceVendoredHostPath("futures", "stream", "empty")}(),`,
            `)))`,
          ])
        );
      }

      yield "      .unwrap();";

      yield "";

      yield "  Ok(response)";

      yield "";

      break;
    }
    case "ModelProperty":
    case "Scalar":
    case "Interface":
    case "Enum":
    case "EnumMember":
    case "TemplateParameter":
    case "Namespace":
    case "Operation":
    case "String":
    case "Number":
    case "Boolean":
    case "StringTemplate":
    case "StringTemplateSpan":
    case "Tuple":
    case "Union":
    case "UnionVariant":
    case "Function":
    case "Decorator":
    case "FunctionParameter":
    case "Object":
    case "Projection":
      throw new UnimplementedError(
        `impl Responder for kind '${impl.for.kind}'`
      );
    default:
      throw new Error(
        `UNREACHABLE: ${(impl.for satisfies never as Type).kind}`
      );
  }

  yield `  }`;
  yield `}`;
  yield "";
}

// SERVER-RAW

function emitRawServer(
  ctx: HttpContext,
  httpService: HttpService,
  operationsModule: Module
) {
  const serverRawModule: Module = {
    name: "server_raw",
    cursor: operationsModule.cursor.enter("server_raw"),

    declarations: [],

    visibility: "pub",
    inline: true,
  };

  operationsModule.declarations.push(serverRawModule);

  for (const operation of httpService.operations) {
    serverRawModule.declarations.push([
      ...emitRawServerOperation(ctx, operation, serverRawModule.cursor),
    ]);
  }
}

function* emitRawServerOperation(
  ctx: HttpContext,
  operation: HttpOperation,
  cursor: PathCursor
): Iterable<string> {
  const { operation: op, verb, responses } = operation;
  const operationNameCase = parseCase(op.name);

  // TODO: altName got out of hand and I have to pass values for it in places where
  // it no longer makes any sense. Refactor emitTypeReference so that altName is optional.
  const operationTrait = op.interface
    ? emitTypeReference(
        ctx,
        op.interface,
        op,
        "owned",
        cursor,
        "**unreachable**"
      )
    : cursor.pathTo(
        createOrGetModuleForNamespace(ctx, op.namespace!).cursor.parent!,
        parseCase(op.namespace!.name).pascalCase
      );

  const [successType, errorType] = splitReturnType(
    ctx,
    op.returnType,
    cursor,
    operationNameCase.pascalCase
  );

  completePendingDeclarations(ctx);

  yield `pub async fn ${operationNameCase.snakeCase}<`;
  yield `  E: ${operationTrait},`;
  // prettier-ignore
  yield `  RequestBody: ${referenceVendoredHostPath("http_body", "Body")} + Send + Sync,`
  yield ">(";
  yield `  mut service: E,`;
  // prettier-ignore
  yield `  request: ${referenceVendoredHostPath("http", "Request")}<RequestBody>,`;
  yield ") -> Result<";
  // prettier-ignore
  yield `  ${referenceVendoredHostPath("http", "Response")}<${referenceHostPath("http", "Body")}>,`;
  // prettier-ignore
  yield `  ${referenceHostPath("http", "ServerError")}<RequestBody, E::Error<${errorType.typeReference}>>`;
  yield "> {";

  yield "  #[allow(unused_variables)]";
  yield "  let (parts, body) = request.into_parts();";
  yield "";

  const needsContentType =
    (operation.parameters.body?.contentTypes.length ?? 0) > 1;

  if (needsContentType) {
    yield `let Some(content_type) = parts`;
    yield `  .headers`;
    yield `  .get("content-type")`;
    yield `  .and_then(|h| h.to_str().ok()) else {`;
    yield `    return Err(${referenceHostPath(
      "http",
      "ServerError",
      "InvalidRequest"
    )});`;
    yield `};`;
  }

  const [_, parameters] = bifilter(op.parameters.properties.values(), (param) =>
    isValueLiteralType(param.type)
  );

  const queryParams: Extract<HttpOperationParameter, { type: "query" }>[] = [];
  const pathParams: Extract<HttpOperationParameter, { type: "path" }>[] = [];

  for (const parameter of operation.parameters.parameters) {
    switch (parameter.type) {
      case "header":
        yield* indent(emitHeaderParamBinding(ctx, parameter, cursor));
        break;
      case "query":
        queryParams.push(parameter);
        break;
      case "path":
        pathParams.push(parameter);
        break;
      default:
        throw new Error(
          `UNREACHABLE: parameter type ${
            (parameter satisfies never as HttpOperationParameter).type
          }`
        );
    }
  }

  if (pathParams.length > 0) {
    // TODO: using `eyes` sucks. We should find a way to pass through the parts
    // matched during routing.
    yield `  #[allow(unused_parens)]`;
    yield `  let (${pathParams
      .map((p) => parseCase(p.param.name).snakeCase)
      .join(", ")}) = ${referenceVendoredHostPath("eyes", "parse!")}(`;

    yield `    parts.uri.path(),`;
    yield `    ${JSON.stringify(operation.path.replace(/{([^}]+)}/g, "{}"))},`;
    yield `     ${pathParams
      .map((p) =>
        emitTypeReference(
          ctx,
          p.param.type,
          p.param,
          "owned",
          cursor,
          "**unreachable**"
        )
      )
      .join(", ")}`;
    yield `  );`;

    yield "";
  }

  for (const qp of queryParams) {
    const qpVarName = parseCase(qp.param.name).snakeCase;
    yield `  let mut ${qpVarName} = None;`;
  }

  yield "";

  if (queryParams.length > 0) {
    // get urlencoded query part
    yield `  let query_params = parts`;
    yield `    .uri`;
    yield `    .query()`;
    yield `    .map(|query| ${referenceVendoredHostPath(
      "url",
      "form_urlencoded",
      "parse"
    )}(query.as_bytes()))`;
    yield `    .ok_or(${referenceHostPath(
      "http",
      "ServerError",
      "InvalidRequest"
    )})?;`;

    yield "";

    yield `  for (k, v) in query_params {`;
    yield `    #[allow(clippy::single_match)]`;
    yield `    match k.as_ref() {`;

    for (const qp of queryParams) {
      const qpVarName = parseCase(qp.param.name).snakeCase;
      yield `      ${JSON.stringify(qp.name)} => {`;
      yield `        ${qpVarName} = Some(v);`;
      yield `      },`;
    }

    // TODO: unknown query parameter?
    yield `      _ => {}`;
    yield `    }`;
    yield `  }`;
    yield "";
  }

  for (const qp of queryParams) {
    if (!qp.param.optional) {
      const qpVarName = parseCase(qp.param.name).snakeCase;
      yield `  let Some(${qpVarName}) = ${qpVarName} else {`;
      // prettier-ignore
      yield `    return Err(${referenceHostPath("http", "ServerError", "InvalidRequest")});`;
      yield "  };";
    }
  }

  yield "";

  if (operation.parameters.body) {
    const body = operation.parameters.body;

    if (body.contentTypes.length > 1) {
      throw new UnimplementedError("dynamic request content type");
    }

    const contentType = body.contentTypes[0] ?? DEFAULT_CONTENT_TYPE;

    switch (contentType) {
      case "application/json": {
        if (!body.parameter) {
          throw new UnimplementedError("Composite body deserialization.");
        }

        const bodyNameCase = parseCase(body.parameter.name);

        yield `  let ${bodyNameCase.snakeCase} = ${referenceHostPath(
          "http",
          "deserialize_body_server"
        )}(body).await?;`;

        yield "";
        break;
      }
      case "application/merge-patch+json":
      case "multipart/form-data":
        yield `let body = unimplemented!(${JSON.stringify(contentType)});`;
        break;
      default:
        throw new UnimplementedError(
          `request deserialization for content-type: '${contentType}'`
        );
    }

    yield "";
  }

  // TODO: map_err is wrong here, and prevents us from running the error variants' Responder impls

  yield `  let result = service`;
  // prettier-ignore
  yield `    .${operationNameCase.snakeCase}(${parameters.map((p) => parseCase(p.name).snakeCase)})`;
  yield "    .await";
  yield `    .map_err(${referenceHostPath(
    "http",
    "ServerError",
    "Operation"
  )})?;`;

  yield "";

  yield `  ${referenceHostPath("http", "Responder", "to_response")}(result)`;

  yield "}";

  yield "";

  implResponderAll(successType);
  implResponderAll(errorType);

  function implResponderAll(split: SplitReturnType) {
    if (split.target) {
      const isBodyType =
        !Array.isArray(split.target) && responsesHaveBodyType(split.target);
      impl(ctx, "Responder", split.target, isBodyType);
    }
    switch (split.kind) {
      case "ordinary":
        break;
      case "union":
        for (const variant of split.variants) {
          const isBodyType = responsesHaveBodyType(variant.type);
          impl(ctx, "Responder", variant.type, isBodyType);
        }
        break;
      default:
        throw new Error(
          `Unreachable: splitReturnType kind '${
            (split satisfies never as SplitReturnType).kind
          }'`
        );
    }
  }

  function responsesHaveBodyType(t: Type): boolean {
    return operation.responses.some((resp) =>
      resp.responses.some((r) => r.body?.type === t)
    );
  }
}

function* emitHeaderParamBinding(
  ctx: HttpContext,
  parameter: Extract<HttpOperationParameter, { type: "header" }>,
  cursor: PathCursor
): Iterable<string> {
  const nameCase = parseCase(parameter.param.name);

  yield `let ${nameCase.snakeCase} = parts`;
  yield `  .headers`;
  yield `  .get(${JSON.stringify(parameter.name)})`;
  yield `  .and_then(|h| h.to_str().ok());`;

  if (!parameter.param.optional) {
    yield `let Some(${nameCase.snakeCase}) = ${nameCase.snakeCase} else {`;
    // prettier-ignore
    yield `  return Err(${referenceHostPath("http", "ServerError", "InvalidRequest")});`;
    yield "};";
    yield "";
  }
}
