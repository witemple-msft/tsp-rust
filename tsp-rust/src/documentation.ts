import { Type, getDoc } from "@typespec/compiler";
import { RustContext } from "./ctx.js";

export function* emitDocumentation(
  ctx: RustContext,
  type: Type
): Iterable<string> {
  const doc = getDoc(ctx.program, type);

  if (doc === undefined) return;

  for (const line of doc.trim().split(/\r?\n/g)) {
    yield `/// ${line}`;
  }
}
