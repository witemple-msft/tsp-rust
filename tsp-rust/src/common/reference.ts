import {
  Type,
  DiagnosticTarget,
  NoTarget,
  getEffectiveModelType,
  IntrinsicType,
  Namespace,
  UnionVariant,
  StringLiteral,
  NumericLiteral,
  BooleanLiteral,
  ObjectType,
  LiteralType,
  Union,
} from "@typespec/compiler";
import { PathCursor, RustContext } from "../ctx.js";
import { RustTranslation, getRustScalar } from "./scalar.js";
import { referenceVendoredHostPath } from "../util/vendored.js";
import { emitWellKnownModel, isWellKnownModel } from "./model.js";
import { parseCase } from "../util/case.js";
import { createOrGetModuleForNamespace } from "./namespace.js";

export type NamespacedType = Extract<Type, { namespace?: Namespace }>;

export function emitTypeReference(
  ctx: RustContext,
  type: Type,
  position: DiagnosticTarget | typeof NoTarget,
  disposition: keyof RustTranslation,
  cursor: PathCursor,
  preferredAlternativeName: string
): string {
  switch (type.kind) {
    case "Scalar":
      return getRustScalar(ctx.program, type, position)[disposition];
    case "Model": {
      if (isWellKnownModel(ctx, type)) {
        return emitWellKnownModel(
          ctx,
          type,
          disposition,
          cursor,
          preferredAlternativeName
        );
      }

      const effectiveModel = getEffectiveModelType(ctx.program, type);

      if (effectiveModel.name === "") {
        if (ctx.syntheticNames.has(effectiveModel)) {
          return cursor.pathTo(
            ctx.syntheticModule.cursor,
            ctx.syntheticNames.get(effectiveModel)!
          );
        }

        // Anonymous model, synthesize a new model with the preferredName
        ctx.synthetics.push({
          kind: "anonymous",
          name: preferredAlternativeName,
          underlying: effectiveModel,
        });

        const name = cursor.pathTo(
          ctx.syntheticModule.cursor,
          preferredAlternativeName
        );

        ctx.syntheticNames.set(effectiveModel, preferredAlternativeName);

        return name;
      } else {
        ctx.typeQueue.add(effectiveModel);
      }

      const templatedName = parseCase(
        effectiveModel.templateMapper
          ? effectiveModel.name +
              effectiveModel
                .templateMapper!.args.map((a) =>
                  "name" in a ? String(a.name) : ""
                )
                .join("_")
          : effectiveModel.name
      );

      if (!effectiveModel.namespace) {
        throw new Error(
          "UNREACHABLE: no parent namespace of named model in emitTypeReference"
        );
      }

      const parentModule = createOrGetModuleForNamespace(
        ctx,
        effectiveModel.namespace
      );

      return cursor.pathTo(parentModule.cursor, templatedName.pascalCase);
    }
    case "Union": {
      if (type.name === "" || type.name === undefined) {
        if (ctx.syntheticNames.has(type)) {
          return cursor.pathTo(
            ctx.syntheticModule.cursor,
            ctx.syntheticNames.get(type)!
          );
        }

        ctx.synthetics.push({
          kind: "anonymous",
          name: preferredAlternativeName,
          underlying: type,
        });

        const name = cursor.pathTo(
          ctx.syntheticModule.cursor,
          preferredAlternativeName
        );

        ctx.syntheticNames.set(type, preferredAlternativeName);

        return name;
      } else {
        ctx.typeQueue.add(type);
      }

      return cursor.resolveAbsolutePathOld("models", type.name);
    }
    case "Enum": {
      ctx.typeQueue.add(type);

      return cursor.resolveAbsolutePathOld("models", type.name);
    }
    case "Number":
    case "String":
    case "Boolean":
      return `compile_error!("encountered '${type.kind}' literal in type graph")`;
    case "Intrinsic":
      switch (type.name) {
        case "never":
          return "!";
        case "null":
        case "void":
          // TODO: is this correct?
          return "()";
        case "ErrorType":
          return `compile_error!("encountered 'ErrorType' in type graph")`;
        case "unknown":
          // TODO: assumes JSON
          return referenceVendoredHostPath("serde_json", "Value");
        default:
          return `compile_error!("encountered unknown intrinsic type '${
            (type satisfies never as IntrinsicType).name
          }' in type graph")`;
      }
    case "Interface": {
      if (type.namespace === undefined) {
        throw new Error("Unreachable: unparented interface");
      }

      const typeName = parseCase(type.name).pascalCase;

      ctx.typeQueue.add(type);

      const parentModule = createOrGetModuleForNamespace(ctx, type.namespace);

      return cursor.pathTo(parentModule.cursor, typeName);
    }
    default:
      throw new Error(`UNREACHABLE: ${type.kind}`);
  }
}

const __SYNTHETIC_UNIONS = new Map<Union, Map<string, PathCursor>>();

function getSyntheticUnionStore(union: Union): Map<string, PathCursor> {
  let store = __SYNTHETIC_UNIONS.get(union);

  if (!store) {
    store = new Map();
    __SYNTHETIC_UNIONS.set(union, store);
  }

  return store;
}

export function emitSyntheticUnionReference(
  ctx: RustContext,
  canonical: Union,
  variants: UnionVariant[],
  cursor: PathCursor,
  preferredAlternativeName: string
): string {
  const store = getSyntheticUnionStore(canonical);

  if (store.has(preferredAlternativeName)) {
    return cursor.pathTo(store.get(preferredAlternativeName)!);
  }

  const targetCursor = ctx.rootModule.cursor.enter("models", "synthetic");
  const absolutePath = targetCursor
    .enter(preferredAlternativeName)
    .path.join("::");

  const reference = cursor.pathTo(targetCursor, preferredAlternativeName);

  if (ctx.syntheticUnions.has(absolutePath)) {
    return reference;
  }

  ctx.synthetics.push({
    kind: "partialUnion",
    name: preferredAlternativeName,
    variants,
  });

  ctx.syntheticUnions.add(absolutePath);

  store.set(preferredAlternativeName, targetCursor);

  return reference;
}

export type RustTypeSpecLiteralType =
  | LiteralType
  | (IntrinsicType & { name: "null" });

export function isValueLiteralType(t: Type): t is RustTypeSpecLiteralType {
  switch (t.kind) {
    case "String":
    case "Number":
    case "Boolean":
      return true;
    case "Intrinsic":
      return t.name === "null";
    default:
      return false;
  }
}
