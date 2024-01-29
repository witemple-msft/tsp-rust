import { Interface, Operation, Type, isErrorModel } from "@typespec/compiler";
import { RustContext, PathCursor } from "../ctx.js";
import { parseCase } from "../util/case.js";
import { getAllProperties } from "../util/extends.js";
import { referenceHostPath } from "../util/vendored.js";
import {
  emitSyntheticUnionReference,
  emitTypeReference,
  isValueLiteralType,
} from "./reference.js";
import { emitDocumentation } from "./documentation.js";
import { indent } from "../util/indent.js";
import { bifilter } from "../util/bifilter.js";

export const ERROR_FRAGMENT = [
  "/// The error type which may be returned by this trait's operations.",
  "type Error<OperationError>;",
  "",
];

export function* emitInterface(
  ctx: RustContext,
  iface: Interface,
  cursor: PathCursor
): Iterable<string> {
  const name = parseCase(iface.name).pascalCase;

  yield* emitDocumentation(ctx, iface);
  yield `pub trait ${name} {`;
  yield* indent(ERROR_FRAGMENT);
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

  const [successResult, errorResult] = splitReturnType(
    ctx,
    op.returnType,
    cursor,
    opNameCase.pascalCase
  );

  const returnType = `impl ${referenceHostPath(
    "OperationFuture"
  )}<${successResult}, Self::Error<${errorResult}>>`;

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
    yield `  fn ${opName}(&mut self${paramsDeclarationLine}) -> ${returnType} {`;
    yield `    Self::${opName}_with_options(self${paramNamesLine}, Default::default()).await`;
    yield "  }";
    yield "";
    yield* indent(documentation);
    // prettier-ignore
    yield `  fn ${opName}_with_options(&mut self${paramsDeclarationLine}, options: ${optionsTypeName}) -> ${returnType};`;
    yield "";
  } else {
    yield* indent(documentation);
    // prettier-ignore
    yield `  fn ${opName}(&mut self${paramsDeclarationLine}) -> ${returnType};`;
    yield "";
  }
}

const DEFAULT_NO_VARIANT_RETURN_TYPE = "::core::convert::Infallible";

function splitReturnType(
  ctx: RustContext,
  type: Type,
  cursor: PathCursor,
  altBaseName: string
): [string, string] {
  const successAltName = altBaseName + "Response";
  const errorAltName = altBaseName + "ErrorResponse";

  if (type.kind === "Union") {
    const [successVariants, errorVariants] = bifilter(
      type.variants.values(),
      (v) => !isErrorModel(ctx.program, v.type)
    );

    const successTypeReference =
      successVariants.length === 0
        ? DEFAULT_NO_VARIANT_RETURN_TYPE
        : successVariants.length === 1
          ? emitTypeReference(
              ctx,
              successVariants[0].type,
              successVariants[0],
              "owned",
              cursor,
              successAltName
            )
          : emitSyntheticUnionReference(
              ctx,
              successVariants,
              cursor,
              successAltName
            );

    const errorTypeReference =
      errorVariants.length === 0
        ? DEFAULT_NO_VARIANT_RETURN_TYPE
        : errorVariants.length === 1
          ? emitTypeReference(
              ctx,
              errorVariants[0].type,
              errorVariants[0],
              "owned",
              cursor,
              errorAltName
            )
          : emitSyntheticUnionReference(
              ctx,
              errorVariants,
              cursor,
              errorAltName
            );

    return [successTypeReference, errorTypeReference];
  } else {
    // No splitting, just figure out if the type is an error type or not and make the other infallible.

    if (isErrorModel(ctx.program, type)) {
      return [
        DEFAULT_NO_VARIANT_RETURN_TYPE,
        emitTypeReference(
          ctx,
          type,
          type,
          "owned",
          cursor,
          altBaseName + "ErrorResponse"
        ),
      ];
    } else {
      return [
        emitTypeReference(
          ctx,
          type,
          type,
          "owned",
          cursor,
          altBaseName + "SuccessResponse"
        ),
        DEFAULT_NO_VARIANT_RETURN_TYPE,
      ];
    }
  }
}
