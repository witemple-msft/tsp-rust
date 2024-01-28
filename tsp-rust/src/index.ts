import "source-map-support/register.js";

import { EmitContext, Namespace, listServices } from "@typespec/compiler";
import { RustEmitterOptions } from "./lib.js";
import { Module, RustContext, createPathCursor } from "./ctx.js";
import { parseCase } from "./util/case.js";
import {
  createOrGetModuleForNamespace,
  visitAllTypes,
} from "./common/namespace.js";
import { writeModuleTree } from "./write.js";
import { createOnceQueue } from "./util/onceQueue.js";
import { emitDeclaration } from "./common/declaration.js";
import { UnimplementedError } from "./util/error.js";

export { $lib } from "./lib.js";

export const namespace = "TypeSpec";

export async function $onEmit(context: EmitContext<RustEmitterOptions>) {
  const services = listServices(context.program);

  if (services.length === 0) {
    throw new Error("No services found in program.");
  } else if (services.length > 1) {
    // TODO
    throw new UnimplementedError("multiple service definitions per program.");
  }

  const [service] = services;

  const serviceModuleName = parseCase(service.type.name).snakeCase;

  const rootCursor = createPathCursor();

  const globalNamespace = context.program.getGlobalNamespaceType();

  const allModule: Module = {
    name: "all",
    cursor: rootCursor.enter("models", "all"),
    namespace: globalNamespace,

    declarations: [],

    visibility: "pub",
    inline: false,
  };

  const syntheticModule: Module = {
    name: "synthetic",
    cursor: rootCursor.enter("models", "synthetic"),

    declarations: [],

    visibility: "pub",
    inline: false,
  };

  const modelsModule: Module = {
    name: "models",
    cursor: rootCursor.enter("models"),

    declarations: [allModule, syntheticModule],

    visibility: "pub",
    inline: false,
  };

  const rootModule: Module = {
    name: serviceModuleName,
    cursor: rootCursor,

    declarations: [modelsModule],

    visibility: "pub",
    inline: false,
  };

  const rustCtx: RustContext = {
    program: context.program,
    service,
    // old http stuff
    httpService: undefined as any,
    authenticationInfo: undefined as any,
    serviceTitle: service.title,
    serviceVersion: service.version,

    contextTypeName: "Context",
    errorTypeName: "Error",

    typeQueue: createOnceQueue(),
    synthetics: [],
    syntheticNames: new Map(),

    options: [],

    baseNamespace: service.type,
    namespaceModules: new Map([[globalNamespace, allModule]]),
  };

  // Find the root of the service module and recursively reconstruct a path to it, adding the definitions along the way.
  let namespacePath = [];
  let namespace: Namespace = service.type;
  while (namespace !== globalNamespace) {
    namespacePath.push(namespace);

    if (!namespace.namespace) {
      throw new Error(
        "UNREACHABLE: failed to encounter global namespace in namespace traversal"
      );
    }

    namespace = namespace.namespace;
  }

  let parentModule = allModule;
  for (const namespace of namespacePath.reverse()) {
    const module = createOrGetModuleForNamespace(rustCtx, namespace);
    parentModule.declarations.push(module);
    parentModule = module;
  }

  // This is where we would activate the protocol-specific codepaths like http, jsonrpc, protobuf, etc.

  // TODO: check for `http` feature and emit HTTP code if set.

  if (!context.options["omit-unreachable-types"]) {
    // Visit everything in the service namespace to ensure we emit a full `models` module and not just the subparts that
    // are reachable from the service impl.

    visitAllTypes(rustCtx, service.type);
  }

  // Add all pending declarations to the module tree.
  while (!rustCtx.typeQueue.isEmpty() || rustCtx.synthetics.length > 0) {
    while (!rustCtx.typeQueue.isEmpty()) {
      const type = rustCtx.typeQueue.take()!;

      if (!type.namespace) {
        // TODO: when can this happen?
        throw new UnimplementedError("no namespace for declaration type");
      }

      const module = createOrGetModuleForNamespace(rustCtx, type.namespace);

      module.declarations.push([
        ...emitDeclaration(rustCtx, type, module.cursor),
      ]);
    }

    while (rustCtx.synthetics.length > 0) {
      const synthetic = rustCtx.synthetics.shift()!;

      syntheticModule.declarations.push([
        ...emitDeclaration(
          rustCtx,
          synthetic.underlying,
          syntheticModule.cursor,
          synthetic.name
        ),
      ]);
    }
  }

  try {
    const stat = await context.program.host.stat(context.emitterOutputDir);
    if (stat.isDirectory()) {
      await context.program.host.rm(context.emitterOutputDir, {
        recursive: true,
      });
    }
  } catch {}

  await writeModuleTree(
    rustCtx,
    context.emitterOutputDir,
    rootModule,
    context.options["output-mode"]
  );
}
