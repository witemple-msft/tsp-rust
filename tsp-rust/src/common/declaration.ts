import {
  PathCursor,
  RustContext,
  RustDeclarationType,
  createPathCursor,
} from "../ctx.js";
import { emitEnum } from "./enum.js";
import { indent } from "../util/indent.js";
import { emitModel } from "./model.js";
import { emitUnion } from "./union.js";
import { emitInterface } from "./interface.js";
import { emitScalar } from "./scalar.js";

export function emitDeclarations(ctx: RustContext): string[] {
  const normalLines = [];
  const syntheticLines = [];

  const cursor = createPathCursor("models");

  while (!ctx.typeQueue.isEmpty() || ctx.synthetics.length > 0) {
    while (!ctx.typeQueue.isEmpty()) {
      const type = ctx.typeQueue.take()!;
      normalLines.push(...emitDeclaration(ctx, type, cursor));
    }

    while (ctx.synthetics.length > 0) {
      const synthetic = ctx.synthetics.shift()!;
      syntheticLines.push(
        ...emitDeclaration(
          ctx,
          synthetic.underlying,
          cursor.enter("synthetic"),
          synthetic.name
        )
      );
    }
  }

  return [
    ...normalLines,
    ...(syntheticLines.length > 0
      ? ["pub mod synthetic {", ...indent(syntheticLines), "}"]
      : []),
  ];
}

export function* emitDeclaration(
  ctx: RustContext,
  type: RustDeclarationType,
  cursor: PathCursor,
  altName?: string
): Iterable<string> {
  switch (type.kind) {
    case "Model": {
      yield* emitModel(ctx, type, cursor, altName);
      break;
    }
    case "Enum": {
      yield* emitEnum(ctx, type);
      break;
    }
    case "Union": {
      yield* emitUnion(ctx, type, cursor, altName);
      break;
    }
    case "Interface": {
      yield* emitInterface(ctx, type, cursor);
      break;
    }
    case "Scalar": {
      yield emitScalar(ctx, type);
      break;
    }
    default: {
      throw new Error(
        "Internal Error: Unhandled type kind: " +
          (type satisfies never as any).kind
      );
    }
  }
}
