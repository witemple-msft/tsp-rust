import {
  Interface,
  Operation,
  Type,
  UnionVariant,
  isErrorModel,
} from "@typespec/compiler";
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
  "type Error<OperationError>: std::error::Error + Send + Sync + 'static;",
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

  const returnType = `impl ${referenceHostPath("OperationFuture")}<${
    successResult.typeReference
  }, Self::Error<${errorResult.typeReference}>>`;

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

export interface SplitReturnTypeCommon {
  typeReference: string;
  target: Type | [PathCursor, string] | undefined;
}

export interface OrdinarySplitReturnType extends SplitReturnTypeCommon {
  kind: "ordinary";
}

export interface UnionSplitReturnType extends SplitReturnTypeCommon {
  kind: "union";
  variants: UnionVariant[];
}

export type SplitReturnType = OrdinarySplitReturnType | UnionSplitReturnType;

const DEFAULT_NO_VARIANT_RETURN_TYPE = "::core::convert::Infallible";
const DEFAULT_NO_VARIANT_SPLIT: SplitReturnType = {
  kind: "ordinary",
  typeReference: DEFAULT_NO_VARIANT_RETURN_TYPE,
  target: undefined,
};

export function splitReturnType(
  ctx: RustContext,
  type: Type,
  cursor: PathCursor,
  altBaseName: string
): [SplitReturnType, SplitReturnType] {
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
              type,
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
              type,
              errorVariants,
              cursor,
              errorAltName
            );

    const successSplit: SplitReturnType =
      successVariants.length > 1
        ? {
            kind: "union",
            variants: successVariants,
            typeReference: successTypeReference,
            target: cursor.resolveRelativeItemPath(successTypeReference),
          }
        : {
            kind: "ordinary",
            typeReference: successTypeReference,
            target: successVariants[0].type,
          };

    const errorSplit: SplitReturnType =
      errorVariants.length > 1
        ? {
            kind: "union",
            variants: errorVariants,
            typeReference: errorTypeReference,
            target: cursor.resolveRelativeItemPath(errorTypeReference),
          }
        : {
            kind: "ordinary",
            typeReference: errorTypeReference,
            target: errorVariants[0].type,
          };

    return [successSplit, errorSplit];
  } else {
    // No splitting, just figure out if the type is an error type or not and make the other infallible.

    if (isErrorModel(ctx.program, type)) {
      const typeReference = emitTypeReference(
        ctx,
        type,
        type,
        "owned",
        cursor,
        altBaseName + "ErrorResponse"
      );

      return [
        DEFAULT_NO_VARIANT_SPLIT,
        {
          kind: "ordinary",
          typeReference,
          target: type,
        },
      ];
    } else {
      const typeReference = emitTypeReference(
        ctx,
        type,
        type,
        "owned",
        cursor,
        altBaseName + "SuccessResponse"
      );
      return [
        {
          kind: "ordinary",
          typeReference,
          target: type,
        },
        DEFAULT_NO_VARIANT_SPLIT,
      ];
    }
  }
}
