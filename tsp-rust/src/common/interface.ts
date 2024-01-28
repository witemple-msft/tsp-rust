import { Interface, Operation } from "@typespec/compiler";
import { RustContext, PathCursor } from "../ctx.js";
import { parseCase } from "../util/case.js";
import { getAllProperties } from "../util/extends.js";
import { referencePath, vendoredModulePath } from "../util/vendored.js";
import { emitTypeReference, isValueLiteralType } from "./reference.js";
import { emitDocumentation } from "./documentation.js";
import { indent } from "../util/indent.js";

export function* emitInterface(
  ctx: RustContext,
  iface: Interface,
  cursor: PathCursor
): Iterable<string> {
  const name = parseCase(iface.name).pascalCase;

  yield* emitDocumentation(ctx, iface);
  yield `pub trait ${name} {`;

  yield "  /// The associated error which may be returned by this trait's operations.";
  yield "  type Error: ::std::error::Error;";
  yield "";

  yield* emitOperationGroup(ctx, iface.operations.values(), cursor);

  yield "}";
  yield "";
}

export function* emitOperationGroup(
  ctx: RustContext,
  operations: Iterable<Operation>,
  cursor: PathCursor
): Iterable<string> {
  for (const op of operations) {
    yield* emitOperation(ctx, op, cursor);
    yield "";
  }
}

export function* emitOperation(
  ctx: RustContext,
  op: Operation,
  cursor: PathCursor
): Iterable<string> {
  const opNameCase = parseCase(op.name);

  const opName = opNameCase.snakeCase;

  const hasOptions = getAllProperties(op.parameters).some((p) => p.optional);

  const returnTypeReference = emitTypeReference(
    ctx,
    op.returnType,
    op,
    "owned",
    cursor,
    opNameCase.pascalCase + "Output"
  );

  const returnType = `impl ${referencePath(
    "OperationResult"
  )}<${returnTypeReference}, Self::Error>`;

  const params: string[] = [];

  const documentation = emitDocumentation(ctx, op);

  for (const param of getAllProperties(op.parameters)) {
    // If the type is a value literal, then we consider it a _setting_ and not a parameter.
    // This allows us to exclude metadata parameters (such as contentType) from the generated interface.
    if (isValueLiteralType(param.type)) continue;

    const paramNameCase = parseCase(param.name);
    const paramName = paramNameCase.snakeCase;

    const outputTypeReference = emitTypeReference(
      ctx,
      param.type,
      param,
      "param",
      cursor,
      opNameCase.pascalCase + paramNameCase.pascalCase
    );

    params.push(`${paramName}: ${outputTypeReference}`);
  }

  const paramsDeclarationLine =
    params.length > 0 ? ", " + params.join(", ") : "";

  if (hasOptions) {
    const optionsTypeName = opNameCase.pascalCase + "Options";

    const paramNamesLine =
      params.length > 0
        ? ", " + params.map((p) => p.split(":", 2)[0].trim()).join(", ")
        : "";

    // TODO: how to extract parameter documentation?

    // prettier-ignore
    yield* indent(documentation);
    yield `  fn ${opName}(&self${paramsDeclarationLine}) -> ${returnType} {`;
    yield `    Self::${opName}_with_options(self${paramNamesLine}, Default::default()).await`;
    yield "  }";
    yield "";
    yield* indent(documentation);
    // prettier-ignore
    yield `  fn ${opName}_with_options(&self${paramsDeclarationLine}, options: ${optionsTypeName}) -> ${returnType};`;
    yield "";
  } else {
    yield* indent(documentation);
    // prettier-ignore
    yield `  fn ${opName}(&self${paramsDeclarationLine}) -> ${returnType};`;
    yield "";
  }
}
