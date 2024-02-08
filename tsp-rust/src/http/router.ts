import { HttpService, HttpVerb, OperationContainer } from "@typespec/http";
import { HttpContext } from "./feature.js";
import { Module, PathCursor } from "../ctx.js";
import { Operation } from "@typespec/compiler";
import { bifilter } from "../util/bifilter.js";
import { ReCase, parseCase } from "../util/case.js";
import { createOrGetModuleForNamespace } from "../common/namespace.js";
import { emitTypeReference } from "../common/reference.js";
import {
  referenceHostPath,
  referenceVendoredHostPath,
} from "../util/vendored.js";
import { indent } from "../util/indent.js";
import { utf8Length } from "../util/utf8.js";

export function emitRouter(ctx: HttpContext, service: HttpService) {
  const routerModule: Module = {
    name: "router",
    cursor: ctx.httpModule.cursor.enter("router"),

    declarations: [],

    visibility: "pub",
    inline: false,
  };

  ctx.httpModule.declarations.push(routerModule);

  const routeTree = createRouteTree(ctx, service);

  routerModule.declarations.push([
    ...emitRouterDefinition(ctx, service, routeTree, routerModule.cursor),
  ]);
}

function* emitRouterDefinition(
  ctx: HttpContext,
  service: HttpService,
  routeTree: RouteTree,
  cursor: PathCursor
): Iterable<string> {
  const routerName = parseCase(service.namespace.name).pascalCase + "Router";

  const uniqueContainers = new Set(
    service.operations.map((operation) => operation.container)
  );

  const backends = new Map<OperationContainer, [ReCase, string]>();

  for (const container of uniqueContainers) {
    const param = parseCase(container.name);

    const traitConstraint =
      container.kind === "Namespace"
        ? cursor.pathTo(
            createOrGetModuleForNamespace(ctx, container).cursor,
            param.pascalCase
          )
        : emitTypeReference(
            ctx,
            container,
            container,
            "owned",
            cursor,
            "**unreachable**"
          );

    backends.set(container, [param, traitConstraint]);
  }

  const genericParams = [...backends.values()]
    .map(
      ([param, traitConstraint]) =>
        `${param.pascalCase}: ${traitConstraint} + Clone`
    )
    .join(", ");

  const genericArgs = [...backends.values()]
    .map(([param]) => param.pascalCase)
    .join(", ");

  const fieldNames = [...backends.values()].map(([param]) => param.snakeCase);

  const instantiationParams = [...backends.values()]
    .map(([param]) => `${param.snakeCase}: ${param.pascalCase}`)
    .join(", ");

  yield "#[derive(Clone)]";
  yield `pub struct ${routerName}<${genericParams}> {`;

  for (const [param] of backends.values()) {
    yield `  ${param.snakeCase}: ${param.pascalCase},`;
  }

  yield "}";
  yield "";

  yield `impl<${genericParams}> ${routerName}<${genericArgs}> {`;
  yield `  pub fn new(${instantiationParams}) -> Self {`;
  yield `    Self { ${fieldNames.join(", ")} }`;
  yield "  }";
  yield "}";
  yield "";

  const serviceGenericParams = [...backends.values()]
    .map(
      ([param, traitConstraint]) =>
        `${param.pascalCase}: ${traitConstraint} + Clone + Send`
    )
    .join(", ");

  yield "impl<";
  yield `  ${serviceGenericParams},`;
  yield `  RequestBody: ${referenceVendoredHostPath(
    "http_body",
    "Body"
  )} + Send + Sync + 'static,`;
  yield `> ${referenceVendoredHostPath(
    "tower",
    "Service"
  )}<${referenceVendoredHostPath(
    "http",
    "Request"
  )}<RequestBody>> for ${routerName}<${genericArgs}>`;
  yield `where`;
  yield `  <RequestBody as ${referenceVendoredHostPath(
    "http_body",
    "Body"
  )}>::Error: std::error::Error + Send + Sync,`;
  yield `  <RequestBody as ${referenceVendoredHostPath(
    "http_body",
    "Body"
  )}>::Data: Send + Sync,`;
  yield "{";
  yield `  type Response = ${referenceVendoredHostPath(
    "http",
    "Response"
  )}<${referenceHostPath("http", "Body")}>;`;
  yield "";
  // TODO: obviously wrong. need to figure out an error type for the router impl and remove the subsequent panics
  yield `  type Error = core::convert::Infallible;`;
  yield "";
  yield `  type Future = impl core::future::Future<Output = Result<Self::Response, Self::Error>> + Send;`;
  yield "";
  yield `  fn poll_ready(`;
  yield `    &mut self,`;
  yield `    _cx: &mut core::task::Context<'_>,`;
  yield `  ) -> core::task::Poll<Result<(), Self::Error>> {`;
  yield `    core::task::Poll::Ready(Ok(()))`;
  yield `  }`;
  yield "";
  yield `  fn call(&mut self, req: ${referenceVendoredHostPath(
    "http",
    "Request"
  )}<RequestBody>) -> Self::Future {`;
  yield `    use ${cursor.pathTo(
    ctx.httpModule.cursor.enter("operations", "server_raw")
  )};`;
  yield "";

  // TODO: this sucks. Currently can't find a way to bind the router into the returned future because of lifetime issues.
  //       The router needs to be referenced so that only the individual service required for the route is passed into
  //       the route handler, but that involves keeping a mutable reference in the future, which may outlive the router
  //       itself. I can't for the life of me figure out how to annotate the Service impl with the right lifetimes to
  //       make it apparent to the compiler that the returned future borrows from the router.
  yield `    let router = self.clone();`;
  yield "";

  yield `    #[allow(clippy::manual_strip)]`;
  yield `    async move {`;
  yield `      let path = req.uri().path().to_owned();`;
  yield `      let path = path.as_str();`;

  yield* indent(indent(emitRouteHandler(ctx, routeTree, backends, cursor)));

  yield "";

  yield `      panic!("Not found.");`;

  yield "    }";
  yield "  }";
  yield "}";
}

function* emitRouteHandler(
  ctx: HttpContext,
  routeTree: RouteTree,
  backends: Map<OperationContainer, [ReCase, string]>,
  cursor: PathCursor
): Iterable<string> {
  const mustTerminate = routeTree.edges.length === 0 && !routeTree.bind;

  yield `if path.is_empty() {`;
  if (routeTree.operations.length > 0) {
    yield* indent(
      emitRouteOperationDispatch(ctx, routeTree.operations, backends, cursor)
    );
  } else {
    // Not found
    yield `  panic!("Not found.");`;
  }
  yield `}`;

  if (mustTerminate) {
    // Not found
    yield "else {";
    yield `  panic!("Not found.");`;
    yield `}`;
    return;
  }

  for (const [edge, nextTree] of routeTree.edges) {
    const edgePattern = edge.length === 1 ? `'${edge}'` : JSON.stringify(edge);
    yield `else if path.starts_with(${edgePattern}) {`;
    yield `  let path = &path[${utf8Length(edge)}..];`;
    yield* indent(emitRouteHandler(ctx, nextTree, backends, cursor));
    yield "}";
  }

  if (routeTree.bind) {
    const [parameterSet, nextTree] = routeTree.bind;
    const parameters = [...parameterSet];

    yield `else {`;
    const paramName = parameters.length === 1 ? parameters[0] : "param";
    yield `  let (${paramName}, path) = path.split_at(path.find('/').unwrap_or(path.len()));`;
    if (parameters.length !== 1) {
      for (const p of parameters) {
        yield `  let ${parseCase(p).snakeCase} = param;`;
      }
    }
    yield* indent(emitRouteHandler(ctx, nextTree, backends, cursor));

    yield `}`;
  }
}

function* emitRouteOperationDispatch(
  ctx: HttpContext,
  operations: RouteOperation[],
  backends: Map<OperationContainer, [ReCase, string]>,
  cursor: PathCursor
): Iterable<string> {
  yield `match *req.method() {`;
  for (const operation of operations) {
    const [backend] = backends.get(operation.container)!;
    const operationName = parseCase(operation.operation.name).snakeCase;

    const backendMemberName = backend.snakeCase;

    const parameters =
      operation.parameters.length > 0
        ? ", " +
          operation.parameters
            .map((param) => parseCase(param.name).snakeCase)
            .join(", ")
        : "";

    yield `  ${referenceVendoredHostPath(
      "http",
      "Method",
      operation.verb.toUpperCase()
    )} => {`;
    // TODO: unwrap bad :(
    yield `    return Ok(server_raw::${operationName}(router.${backendMemberName}, req${parameters}).await.unwrap())`;
    yield `  },`;
  }

  // TODO: panic bad :(
  yield `  _ => {`;
  yield `    panic!("No such method.");`;
  yield `  },`;

  yield "}";
}

interface RouteTree {
  operations: RouteOperation[];
  bind?: [Set<string>, RouteTree];
  edges: RouteTreeEdge[];
}

type RouteTreeEdge = readonly [string, RouteTree];

interface RouteOperation {
  operation: Operation;
  container: OperationContainer;
  parameters: RouteParameter[];
  verb: HttpVerb;
}

interface Route extends RouteOperation {
  segments: RouteSegment[];
}

function createRouteTree(ctx: HttpContext, service: HttpService): RouteTree {
  const routes = service.operations.map(function (operation) {
    const segments = getRouteSegments(ctx, operation.path);
    return {
      operation: operation.operation,
      container: operation.container,
      verb: operation.verb,
      parameters: segments.filter((segment) => typeof segment !== "string"),
      segments,
    } as Route;
  });

  // Build the tree by iteratively removing common prefixes from the text segments.

  const tree = intoRouteTree(routes);

  debugger;

  return tree;
}

/**
 * Build a route tree from a list of routes.
 *
 * @param routes - the routes to build the tree from
 */
function intoRouteTree(routes: Route[]): RouteTree {
  const [operations, rest] = bifilter(
    routes,
    (route) => route.segments.length === 0
  );
  const [literal, parameterized] = bifilter(
    rest,
    (route) => typeof route.segments[0]! === "string"
  );

  const edgeMap = new Map<string, Route[]>();

  // Group the routes by common prefix

  outer: for (const literalRoute of literal) {
    const segment = literalRoute.segments[0] as string;

    for (const edge of [...edgeMap.keys()]) {
      const prefix = commonPrefix(segment, edge);

      if (prefix.length > 0) {
        const existing = edgeMap.get(edge)!;
        edgeMap.delete(edge);
        edgeMap.set(prefix, [...existing, literalRoute]);
        continue outer;
      }
    }

    edgeMap.set(segment, [literalRoute]);
  }

  const edges = [...edgeMap.entries()].map(
    ([edge, routes]) =>
      [
        edge,
        intoRouteTree(
          routes.map(function removePrefix(route) {
            const [prefix, ...rest] = route.segments as [
              string,
              ...RouteSegment[],
            ];

            if (prefix === edge) {
              return { ...route, segments: rest };
            } else {
              return {
                ...route,
                segments: [prefix.substring(edge.length), ...rest],
              };
            }
          })
        ),
      ] as const
  );

  let bind: [Set<string>, RouteTree] | undefined;

  if (parameterized.length > 0) {
    const parameters = new Set<string>();
    const nextRoutes: Route[] = [];
    for (const parameterizedRoute of parameterized) {
      const [{ name }, ...rest] = parameterizedRoute.segments as [
        RouteParameter,
        ...RouteSegment[],
      ];

      parameters.add(name);
      nextRoutes.push({ ...parameterizedRoute, segments: rest });
    }

    bind = [parameters, intoRouteTree(nextRoutes)];
  }

  return {
    operations,
    bind,
    edges,
  };

  function commonPrefix(a: string, b: string): string {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) {
      i++;
    }
    return a.substring(0, i);
  }
}

type RouteSegment = string | RouteParameter;

interface RouteParameter {
  name: string;
}

function getRouteSegments(
  ctx: HttpContext,
  routeTemplate: string
): RouteSegment[] {
  // Parse the route template into segments of "prefixes" (i.e. literal strings)
  // and parameters (names enclosed in curly braces). The "/" character does not
  // actually matter for this. We just want to know what the segments of the route
  // are.
  //
  // Examples:
  //  "" => []
  //  "/users" => ["/users"]
  //  "/users/{userId}" => ["/users/", {name: "userId"}]
  //  "/users/{userId}/posts/{postId}" => ["/users/", {name: "userId"}, "/posts/", {name: "postId"}]
  //
  //  TODO: can this work?
  //  "/users/{userId}-{postId}" => ["/users/", {name: "userId"}, "-", {name: "postId"}]
  //    - It will parse fine as a route segment in this library but will be very difficult to match in the router
  //      implementation, since attempting to expand the parameter may greedily capture characters that are part of
  //      the next segment.
  //
  // TODO: This is only slightly different from operation.pathSegments in that it preserves the slashes between segments,
  //       making it a much more direct representation of the route template.

  const segments: RouteSegment[] = [];

  let remainingTemplate = routeTemplate;

  while (remainingTemplate.length > 0) {
    // Scan for next `{` character
    const openBraceIndex = remainingTemplate.indexOf("{");

    if (openBraceIndex === -1) {
      // No more parameters, just add the remaining string as a segment
      segments.push(remainingTemplate);
      break;
    }

    // Add the prefix before the parameter, if there is one
    if (openBraceIndex > 0) {
      segments.push(remainingTemplate.substring(0, openBraceIndex));
    }

    // Scan for next `}` character
    let closeBraceIndex = remainingTemplate.indexOf("}", openBraceIndex);

    if (closeBraceIndex === -1) {
      // TODO: this _MUST_ be an error in the HTTP layer, so we don't need to raise a diagnostic here?
      segments.push({ name: remainingTemplate.substring(openBraceIndex + 1) });
      break;
    }

    // Extract the parameter name
    const parameterName = remainingTemplate.substring(
      openBraceIndex + 1,
      closeBraceIndex
    );

    segments.push({ name: parameterName });

    // Move to the next segment
    remainingTemplate = remainingTemplate.substring(closeBraceIndex + 1);
  }

  return segments;
}
