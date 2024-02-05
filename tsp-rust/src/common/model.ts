import {
  Model,
  ModelProperty,
  NumericLiteral,
  Scalar,
  Type,
  getEncode,
  getFriendlyName,
  getProjectedName,
  isArrayModelType,
  isTemplateInstance,
} from "@typespec/compiler";
import { parseCase } from "../util/case.js";
import { PathCursor, RustContext } from "../ctx.js";
import { indent } from "../util/indent.js";
import { KEYWORDS } from "./keywords.js";
import { getFullyQualifiedTypeName } from "../util/name.js";
import { getRecordValueName, getArrayElementName } from "../util/pluralism.js";
import { RustTranslation } from "./scalar.js";
import { referenceVendoredHostPath } from "../util/vendored.js";
import {
  RustTypeSpecLiteralType,
  emitTypeReference,
  isValueLiteralType,
} from "./reference.js";
import { emitDocumentation } from "./documentation.js";
import { reportDiagnostic } from "../lib.js";
import { bifilter } from "../util/bifilter.js";

export function* emitModel(
  ctx: RustContext,
  model: Model,
  cursor: PathCursor,
  altName?: string
): Iterable<string> {
  const isTemplate = isTemplateInstance(model);
  const friendlyName = getFriendlyName(ctx.program, model);

  const modelNameCase = parseCase(
    friendlyName
      ? friendlyName
      : isTemplate
        ? model.name +
          model
            .templateMapper!.args.map((a) =>
              "name" in a ? String(a.name) : ""
            )
            .join("_")
        : model.name
  );

  if (model.name === "" && !altName) {
    throw new Error("Internal Error: Anonymous model with no altName");
  }

  const modelRecursionPoints = getModelRecursion(ctx, model);

  const [settings, fields] = bifilter(model.properties.values(), (f) =>
    isValueLiteralType(f.type)
  ) as [(ModelProperty & { type: RustTypeSpecLiteralType })[], ModelProperty[]];

  const defaultMode = getDefaultMode(ctx, fields);

  const requiresAs = fields.some(
    (f) => f.type.kind === "Scalar" && getEncode(ctx.program, f)
  );

  yield* emitDocumentation(ctx, model);

  const structName = model.name === "" ? altName! : modelNameCase.pascalCase;

  const derives: string[] = ["Debug", "Clone", "PartialEq"];

  if (defaultMode === "derive") {
    derives.push("Default");
  }

  const deriveString = derives.join(", ");

  if (requiresAs) {
    // prettier-ignore
    yield `#[${referenceVendoredHostPath("serde_with", "serde_as")}(crate = "${referenceVendoredHostPath("serde_with")}")]`;
  }
  // prettier-ignore
  yield `#[derive(${deriveString}, ${referenceVendoredHostPath("serde", "Deserialize")}, ${referenceVendoredHostPath("serde", "Serialize")})]`;
  yield `#[serde(crate = "${referenceVendoredHostPath("serde")}")]`;

  // TODO: need some way to serialize invariable settings as required by the spec.

  yield `pub struct ${structName} {`;

  for (const field of fields) {
    const nameCase = parseCase(field.name);
    const basicName = nameCase.snakeCase;

    const requiresBox = modelRecursionPoints.includes(field.name);

    if (isValueLiteralType(field.type)) return [];

    const typeReference = emitTypeReference(
      ctx,
      field.type,
      field,
      "owned",
      cursor,
      modelNameCase.pascalCase + nameCase.pascalCase
    );

    const boxedTypeReference = requiresBox
      ? `Box<${typeReference}>`
      : typeReference;

    const fullType = field.optional
      ? `Option<${boxedTypeReference}>`
      : boxedTypeReference;

    const jsonName = getProjectedName(ctx.program, field, "json") ?? field.name;

    const name = KEYWORDS.has(basicName) ? `r#${basicName}` : basicName;

    yield* emitDocumentation(ctx, field);

    if (basicName !== jsonName) {
      yield `  #[serde(rename = ${JSON.stringify(jsonName)})]`;
    }

    if (field.optional) {
      yield `  #[serde(skip_serializing_if = "Option::is_none")]`;
    }

    if (field.type.kind === "Scalar") {
      yield* indent(
        getEncodingAsLines(ctx, field as ModelProperty & { type: Scalar })
      );
    }

    yield `  pub ${name}: ${fullType},`;
    yield "";
  }

  yield "}";
  yield "";

  // Add an impl for const settings if necessary.
  if (settings.length > 0) {
    yield `impl ${structName} {`;

    for (const setting of settings) {
      const nameCase = parseCase(setting.name);
      const settingName = nameCase.upper.snakeCase;

      const [settingTypeReference, settingValue] = getRustLiteralTypeAndValue(
        setting.type
      );

      yield "  #[allow(dead_code)]";
      yield `  pub const ${settingName}: ${settingTypeReference} = ${settingValue};`;
    }

    yield "}";
    yield "";
  }
}

export function isWellKnownModel(ctx: RustContext, type: Model): boolean {
  const fullName = getFullyQualifiedTypeName(type);
  return fullName === "TypeSpec.Record" || fullName === "TypeSpec.Array";
}

export function emitWellKnownModel(
  ctx: RustContext,
  type: Model,
  disposition: keyof RustTranslation,
  cursor: PathCursor,
  preferredAlternativeName: string
): string {
  switch (type.name) {
    case "Record": {
      const arg = type.templateMapper?.args[0]!;
      return `${
        disposition === "owned" ? "" : "&"
      }std::collections::HashMap<String, ${emitTypeReference(
        ctx,
        arg,
        type,
        // TODO: manually setting this to "owned" so that the hashmap can own it, but we probably want borrowed forms
        // of maps in general
        "owned",
        cursor,
        getRecordValueName(preferredAlternativeName)
      )}>`;
    }
    case "Array": {
      const arg2 = type.templateMapper?.args[0]!;
      const innerReference = emitTypeReference(
        ctx,
        arg2,
        type,
        "owned",
        cursor,
        getArrayElementName(preferredAlternativeName)
      );
      if (disposition === "owned") return `Vec<${innerReference}>`;
      else {
        return `&[${innerReference}]`;
      }
    }
    default:
      throw new Error(`UNREACHABLE: ${type.name}`);
  }
}

/**
 * Returns the names of all fields that need to be boxed in order to avoid an
 * infinite struct.
 */
function getModelRecursion(ctx: RustContext, model: Model): string[] {
  const queue = [...model.properties].map(([name, type]) => ({
    type: type,
    field: name,
  })) as FieldPath[];

  const recursiveFields = new Set<string>();

  const visited = new Set<Type>();

  while (queue.length > 0) {
    const { type, field } = queue.shift()!;

    if (type === model) {
      recursiveFields.add(field);
      continue;
    }

    const nextTypes: Type[] = [];

    switch (type.kind) {
      case "Scalar":
      case "Enum":
      case "Boolean":
      case "String":
      case "Number":
      case "Intrinsic":
      case "Decorator":
      case "Function":
      case "EnumMember":
      case "FunctionParameter":
      case "Namespace":
      case "TemplateParameter":
      case "Projection":
        break;
      case "Union":
        nextTypes.push(...type.variants.values());
        break;
      case "ModelProperty":
        nextTypes.push(type.type);
        break;
      case "Model":
        nextTypes.push(...type.properties.values());
        break;
      case "Operation":
        nextTypes.push(type.parameters);
        nextTypes.push(type.returnType);
        type.sourceOperation && nextTypes.push(type.sourceOperation);
        break;
      case "Interface":
        nextTypes.push(...type.operations.values());
        break;
      case "UnionVariant":
        nextTypes.push(type.type);
        break;
      case "Object":
        nextTypes.push(...Object.entries(type.properties).map(([, v]) => v));
        break;
      case "Tuple":
        nextTypes.push(...type.values);
        break;
      case "StringTemplate":
        nextTypes.push(...type.spans);
        break;
      case "StringTemplateSpan":
        nextTypes.push(type.type);
        break;
      default:
        throw new Error(`UNREACHABLE: ${(type satisfies never as any).kind}`);
    }

    for (const type of nextTypes.filter((type) => !visited.has(type))) {
      visited.add(type);
      queue.push({ type, field });
    }
  }

  return [...recursiveFields];

  interface FieldPath {
    type: Type;
    field: string;
  }
}

function getDefaultMode(
  ctx: RustContext,
  fields: ModelProperty[]
): "derive" | undefined {
  if (
    fields.every(
      (f) =>
        f.optional ||
        (f.type.kind === "Model" && isArrayModelType(ctx.program, f.type))
    )
  ) {
    return "derive";
  }

  return undefined;
}

function getEncodingAsLines(
  ctx: RustContext,
  p: ModelProperty & { type: Scalar }
): string[] {
  const encoding = getEncode(ctx.program, p);

  if (!encoding) return [];

  if (
    p.type === ctx.program.resolveTypeReference("TypeSpec.utcDateTime")[0] &&
    encoding.type === ctx.program.resolveTypeReference("TypeSpec.int32")[0] &&
    encoding.encoding === "unixTimestamp"
  ) {
    // We represent this in JSON as a number
    debugger;
    return [
      // prettier-ignore
      `#[serde_as(as = "${referenceVendoredHostPath("serde_with", "TimestampSeconds")}<i64>")]`,
    ];
  }

  // TODO: many more required encodings

  reportDiagnostic(ctx.program, {
    code: "unrecognized-encoding",
    format: {
      encoding: encoding.encoding,
      type: getFullyQualifiedTypeName(p.type),
    },
    target: p,
  });

  return [];
}

export function getRustLiteralTypeAndValue(
  type: RustTypeSpecLiteralType
): [string, string] {
  switch (type.kind) {
    case "Boolean":
      return ["bool", String(type.value)];
    case "Number":
      return getNumericLiteralTypeAndValue(type);
    case "String":
      return ["&'static str", JSON.stringify(type.value)];
    case "Intrinsic":
      return ["()", "()"];
    default:
      throw new Error(`UNREACHABLE: ${(type satisfies never as any).kind}`);
  }
}

const INT32_MAX = 2 ** 31 - 1;
const INT32_MIN = -(2 ** 31);

function getNumericLiteralTypeAndValue(type: NumericLiteral): [string, string] {
  // We'll do this pretty simply and use 32 or 64 bit int depending on the size if the underlying value is an int.
  // Otherwise, we'll use f64.

  const value = String(type.value);

  if (Number.isInteger(type.value)) {
    if (type.value > INT32_MAX || type.value < INT32_MIN) {
      return ["i64", value];
    } else {
      return ["i32", value];
    }
  } else {
    return ["f64", value];
  }
}
