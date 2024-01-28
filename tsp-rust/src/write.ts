import { CompilerHost, resolvePath } from "@typespec/compiler";
import { Module, RustContext, isModule } from "./ctx.js";
import { RustEmitterOutputMode } from "./lib.js";

import { emitModuleBody } from "./common/namespace.js";
import { OnceQueue, createOnceQueue } from "./util/onceQueue.js";
import { createMetadataInfo } from "@typespec/http";
import { rustfmt } from "./util/rustfmt.js";

import { EOL } from "os";
import path from "path";

export async function writeModuleTree(
  ctx: RustContext,
  baseOutputPath: string,
  rootModule: Module,
  mode: RustEmitterOutputMode
): Promise<void> {
  const queue = createOnceQueue(rootModule);

  while (!queue.isEmpty()) {
    const module = queue.take()!;
    await writeModuleFile(ctx, baseOutputPath, module, mode, queue);
  }
}

async function writeModuleFile(
  ctx: RustContext,
  baseOutputPath: string,
  module: Module,
  mode: RustEmitterOutputMode,
  queue: OnceQueue<Module>
): Promise<void> {
  const moduleText = [
    "// Generated by Microsoft TypeSpec",
    "",
    ...emitModuleBody(ctx, module, mode === "module", queue),
  ];

  const isModRs =
    module.cursor.path.length === 0 ||
    module.declarations.some((decl) => isModule(decl) && !decl.inline);

  const moduleRelativePath =
    module.cursor.path.length > 0
      ? module.cursor.path.join("/") + (isModRs ? "/mod.rs" : ".rs")
      : "mod.rs";

  const modulePath = resolvePath(baseOutputPath, moduleRelativePath);

  await ctx.program.host.mkdirp(path.dirname(modulePath));
  await ctx.program.host.writeFile(modulePath, moduleText.join(EOL));

  await rustfmt(ctx, modulePath);
}