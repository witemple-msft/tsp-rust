import {
  Type,
  DiagnosticTarget,
  NoTarget,
  getEffectiveModelType,
  IntrinsicType,
  Namespace,
} from "@typespec/compiler";
import { PathCursor, RustContext } from "../ctx.js";
import { RustTranslation, getRustScalar } from "./scalar.js";
import { vendoredModulePath } from "../util/vendored.js";
import { emitWellKnownModel, isWellKnownModel } from "./model.js";
import { parseCase } from "../util/case.js";

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
          return ctx.syntheticNames.get(effectiveModel)!;
        }

        // Anonymous model, synthesize a new model with the preferredName
        ctx.synthetics.push({
          name: preferredAlternativeName,
          underlying: effectiveModel,
        });

        const name = cursor.resolveAbsolutePath(
          "models",
          "synthetic",
          preferredAlternativeName
        );

        ctx.syntheticNames.set(effectiveModel, name);

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

      return cursor.resolveAbsolutePath("models", templatedName.pascalCase);
    }
    case "Union": {
      if (type.name === "" || type.name === undefined) {
        if (ctx.syntheticNames.has(type)) {
          return ctx.syntheticNames.get(type)!;
        }

        ctx.synthetics.push({
          name: preferredAlternativeName,
          underlying: type,
        });

        const name = cursor.resolveAbsolutePath(
          "models",
          "synthetic",
          preferredAlternativeName
        );

        ctx.syntheticNames.set(type, name);

        return name;
      } else {
        ctx.typeQueue.add(type);
      }

      return cursor.resolveAbsolutePath("models", type.name);
    }
    case "Enum": {
      ctx.typeQueue.add(type);

      return cursor.resolveAbsolutePath("models", type.name);
    }
    case "Number":
    case "String":
    case "Boolean":
      return `compile_error!("encountered '${type.kind}' literal in model graph")`;
    case "Intrinsic":
      switch (type.name) {
        case "never":
          return "!";
        case "null":
        case "void":
          // TODO: is this correct?
          return "()";
        case "ErrorType":
          return `compile_error!("encountered 'ErrorType' in model graph")`;
        case "unknown":
          // TODO: assumes JSON
          return vendoredModulePath("serde_json", "Value");
        default:
          return `compile_error!("encountered unknown intrinsic type '${
            (type satisfies never as IntrinsicType).name
          }' in model graph")`;
      }
    default:
      throw new Error(`UNREACHABLE: ${type.kind}`);
  }
}

export function isValueLiteralType(t: Type): boolean {
  switch (t.kind) {
    case "String":
    case "Number":
    case "Boolean":
    case "Object":
      return true;
    case "Intrinsic":
      return t.name === "null";
    default:
      return false;
  }
}