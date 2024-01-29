import "source-map-support/register.js";

import { EmitContext, Namespace, listServices } from "@typespec/compiler";
import {
  DEFAULT_CRATE_PATH,
  DEFAULT_OUTPUT_MODE,
  RustEmitterOptions,
} from "./lib.js";
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
import { setHostPath } from "./util/vendored.js";
import { getFeatureHandler } from "./feature.js";

// #region features

import "./http/feature.js";
import { emitUnion } from "./common/union.js";

// #endregion

export { $lib } from "./lib.js";

export async function $onEmit(context: EmitContext<RustEmitterOptions>) {
  setHostPath(context.options["crate-path"] ?? DEFAULT_CRATE_PATH);

  const services = listServices(context.program);

  if (services.length === 0) {
    console.warn("No services found in program.");
    return;
  } else if (services.length > 1) {
    throw new UnimplementedError("multiple service definitions per program.");
  }

  const [service] = services;

  const serviceModuleName = parseCase(service.type.name).snakeCase;

  const rootCursor = createPathCursor();

  const globalNamespace = context.program.getGlobalNamespaceType();

  // Module for all types in all namespaces.
  const allModule: Module = {
    name: "all",
    cursor: rootCursor.enter("models", "all"),
    namespace: globalNamespace,

    declarations: [],

    visibility: "pub",
    inline: false,
  };

  // Module for all synthetic (named ad-hoc) types.
  const syntheticModule: Module = {
    name: "synthetic",
    cursor: rootCursor.enter("models", "synthetic"),

    declarations: [],

    visibility: "pub",
    inline: false,
  };

  // Module for all models, including synthetic and all.
  const modelsModule: Module = {
    name: "models",
    cursor: rootCursor.enter("models"),

    declarations: [allModule, syntheticModule],

    visibility: "pub",
    inline: false,
  };

  // Root module for emit.
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

    rootModule,
    baseNamespace: service.type,
    namespaceModules: new Map([[globalNamespace, allModule]]),
    syntheticUnions: new Set(),
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

  for (const [name, options] of Object.entries(context.options.features) as [
    keyof RustEmitterFeature,
    any,
  ][]) {
    const handler = getFeatureHandler(name);
    await handler(rustCtx, options);
  }

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

      switch (synthetic.kind) {
        case "anonymous": {
          syntheticModule.declarations.push(
            ...emitDeclaration(
              rustCtx,
              synthetic.underlying,
              syntheticModule.cursor,
              synthetic.name
            )
          );
          break;
        }
        case "partialUnion": {
          syntheticModule.declarations.push(
            ...emitUnion(
              rustCtx,
              synthetic,
              syntheticModule.cursor,
              synthetic.name
            )
          );
          break;
        }
      }
    }
  }

  const pathToServiceNamespace = rootModule.cursor.pathTo(
    createOrGetModuleForNamespace(rustCtx, service.type).cursor
  );

  rootModule.declarations.push([
    "#[allow(unused_imports)]",
    `pub use ${pathToServiceNamespace}::*;`,
  ]);

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
    context.options["output-mode"] ?? DEFAULT_OUTPUT_MODE
  );
}
