import {
  Union,
  UnionVariant,
  getDiscriminator,
  getDoc,
  isArrayModelType,
  isNullType,
  isRecordModelType,
} from "@typespec/compiler";
import { PartialUnionSynthetic, PathCursor, RustContext } from "../ctx.js";
import {
  referenceHostPath,
  referenceVendoredHostPath,
} from "../util/vendored.js";
import { parseCase } from "../util/case.js";
import { emitTypeReference } from "./reference.js";

export function* emitUnion(
  ctx: RustContext,
  union: Union | PartialUnionSynthetic,
  cursor: PathCursor,
  altName?: string
): Iterable<string> {
  const name = union.name ? parseCase(union.name).pascalCase : altName;
  const isPartialSynthetic = union.kind === "partialUnion";

  if (name === undefined) {
    throw new Error("Internal Error: Union name is undefined");
  }

  const allVariantsAreNamed = [...union.variants.values()].every(
    (v) => typeof v.name === "string" && v.name
  );

  const discriminator = isPartialSynthetic
    ? undefined
    : getDiscriminator(ctx.program, union)?.propertyName;

  yield `#[derive(Debug, Clone, PartialEq, ${referenceVendoredHostPath(
    "serde",
    "Deserialize"
  )}, ${referenceVendoredHostPath("serde", "Serialize")})]`;
  yield `#[serde(crate = "${referenceVendoredHostPath("serde")}")]`;

  if (allVariantsAreNamed && discriminator) {
    yield `#[serde(tag = "${discriminator}")]`;
  } else {
    yield `#[serde(untagged)]`;
  }

  const doc = isPartialSynthetic ? undefined : getDoc(ctx.program, union);
  if (doc) yield `#[doc = ${JSON.stringify(doc)}]`;

  yield `pub enum ${name} {`;

  const variants = isPartialSynthetic
    ? union.variants.map((v) => [v.name, v] as const)
    : union.variants.entries();

  let idx = 0;
  for (const [key, variant] of variants) {
    idx += 1;

    const variantName =
      typeof key === "string" ? key : getVariantName(ctx, variant, idx);

    const variantNameCase = parseCase(variantName);

    if (isNullType(variant.type)) {
      // prettier-ignore
      yield `  #[serde(with = "${referenceHostPath("serialize", "null_variant")}")]`;
      yield "  Null,";
    } else if (variant.type.kind == "String") {
      yield `  #[serde(rename = ${JSON.stringify(variant.type.value)})]`;
      yield `  ${variantNameCase.pascalCase},`;
    } else {
      const variantTypeReference = emitTypeReference(
        ctx,
        variant.type,
        variant,
        "owned",
        cursor,
        name + variantNameCase.pascalCase
      );

      yield `  ${variantNameCase.pascalCase}(${variantTypeReference}),`;
    }
  }

  yield "}";
  yield "";
}

function getVariantName(
  ctx: RustContext,
  variant: UnionVariant,
  idx: number
): string {
  const name = variant.name;

  if (typeof name === "string") {
    return name;
  }

  // First, if this is an array or record variant, we try to get the name from its template arg
  if (
    variant.type.kind === "Model" &&
    (isArrayModelType(ctx.program, variant.type) ||
      isRecordModelType(ctx.program, variant.type))
  ) {
    const templateArg = variant.type.templateMapper!.args[0];

    if (
      "name" in templateArg &&
      templateArg.name &&
      typeof templateArg.name !== "symbol"
    ) {
      return `${templateArg.name}Array`;
    } else {
      return `Anonymous${idx}Array`;
    }
  }
  // Second, try to derive the name from the type
  else if (
    "name" in variant.type &&
    variant.type.name &&
    variant.type.name !== "" &&
    typeof variant.type.name !== "symbol"
  ) {
    return variant.type.name;
  }

  if (variant.type.kind === "String") {
    return parseCase(variant.type.value).pascalCase;
  }

  return `Anonymous${idx}`;
}
