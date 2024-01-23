import { EmitContext, resolvePath } from "@typespec/compiler";
import { getAllHttpServices } from "@typespec/http";

import { emitRust } from "./module.js";

export { $lib } from "./lib.js";

export const namespace = "TypeSpec";

export async function $onEmit(context: EmitContext) {
  const [services, diagnostics] = getAllHttpServices(context.program);

  if (diagnostics.length > 0) {
    throw new Error("Encountered errors while listing HTTP services.");
  }

  if (services.length !== 1) {
    throw new Error("Expected exactly one HTTP service.");
  }

  const service = services[0];

  const outputFile = emitRust(context, service);

  const outputPath = resolvePath(context.emitterOutputDir, "output.rs");

  await context.program.host.mkdirp(context.emitterOutputDir);
  await context.program.host.writeFile(outputPath, outputFile);
}
