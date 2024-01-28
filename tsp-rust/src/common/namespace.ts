import { Namespace, getNamespaceFullName } from "@typespec/compiler";
import {
  Module,
  ModuleBodyDeclaration,
  RustContext,
  RustDeclarationType,
  createPathCursor,
} from "../ctx.js";
import { indent } from "../util/indent.js";
import { isIterable, join } from "../util/iter.js";
import { emitOperationGroup } from "./interface.js";
import { getFullyQualifiedNamespacePath } from "../util/name.js";
import { parseCase } from "../util/case.js";
import { OnceQueue } from "../util/onceQueue.js";
import { emitDocumentation } from "./documentation.js";
import { UnimplementedError } from "../util/error.js";

export function visitAllTypes(ctx: RustContext, namespace: Namespace) {
  const { enums, interfaces, models, unions, namespaces, scalars, operations } =
    namespace;

  const module = createOrGetModuleForNamespace(ctx, namespace);

  for (const type of join<RustDeclarationType>(
    enums.values(),
    interfaces.values(),
    models.values(),
    unions.values(),
    scalars.values()
  )) {
    ctx.typeQueue.add(type);
  }

  for (const ns of namespaces.values()) {
    visitAllTypes(ctx, ns);
  }

  if (operations.size > 0) {
    if (!namespace.namespace) {
      throw new UnimplementedError("no parent namespace in visitAllTypes");
    }

    const parentModule = createOrGetModuleForNamespace(
      ctx,
      namespace.namespace
    );

    parentModule.declarations.push([
      // prettier-ignore
      `/// A trait representing the operations defined in the '${getNamespaceFullName(namespace)}' namespace.`,
      `pub trait ${parseCase(namespace.name).pascalCase} {`,
      ...emitOperationGroup(ctx, operations.values(), module.cursor),
      "}",
    ]);
  }
}

export function createOrGetModuleForNamespace(
  ctx: RustContext,
  namespace: Namespace
): Module {
  if (ctx.namespaceModules.has(namespace)) {
    return ctx.namespaceModules.get(namespace)!;
  }

  if (!namespace.namespace) {
    throw new Error(
      "UNREACHABLE: no parent namespace in createOrGetModuleForNamespace"
    );
  }

  const parent = createOrGetModuleForNamespace(ctx, namespace.namespace);
  const name = parseCase(namespace.name).snakeCase;

  const module: Module = {
    name,
    cursor: parent.cursor.enter(name),
    namespace,

    declarations: [],

    visibility: "pub",
    inline: false,
  };

  ctx.namespaceModules.set(namespace, module);

  return module;
}

// export function* emitNamespace(
//   ctx: RustContext,
//   namespace: Namespace
// ): Iterable<string> {
//   const module = createOrGetModuleForNamespace(ctx, namespace);

//   yield `pub mod ${module.name} {`;
//   yield* indent(emitModuleBody(ctx, module, queue));
//   yield "}";
// }

function formatModuleDeclaration(module: Module): string {
  const visibility = module.visibility === "" ? "" : `${module.visibility} `;

  return `${visibility}mod ${module.name}`;
}

function* emitModuleBodyDeclaration(
  ctx: RustContext,
  decl: ModuleBodyDeclaration,
  forceInline: boolean,
  queue: OnceQueue<Module>
): Iterable<string> {
  if (isIterable(decl)) {
    yield* decl;
  } else if (typeof decl === "string") {
    yield decl;
  } else {
    const declLine = formatModuleDeclaration(decl);

    if (decl.namespace) yield* emitDocumentation(ctx, decl.namespace);

    if (forceInline || decl.inline) {
      yield `${declLine} {`;
      yield* indent(emitModuleBody(ctx, decl, true, queue));
      yield "}";
    } else {
      queue.add(decl);
      yield declLine + ";";
    }
  }
}

export function* emitModuleBody(
  ctx: RustContext,
  module: Module,
  forceInline: boolean,
  queue: OnceQueue<Module>
): Iterable<string> {
  for (const decl of module.declarations) {
    yield* emitModuleBodyDeclaration(ctx, decl, forceInline, queue);
    yield "";
  }
}
