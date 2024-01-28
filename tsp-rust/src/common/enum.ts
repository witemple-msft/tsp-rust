import { Enum, getDoc } from "@typespec/compiler";
import { RustContext } from "../ctx.js";
import { vendoredModulePath } from "../util/vendored.js";
import { parseCase } from "../util/case.js";

export function* emitEnum(ctx: RustContext, enum_: Enum): Iterable<string> {
  // It's a core compiler error for an enum not to have all its values be of the same type.

  yield `#[derive(Debug, Clone, PartialEq, ${vendoredModulePath(
    "serde",
    "Deserialize"
  )}, ${vendoredModulePath("serde", "Serialize")})]`;
  yield `#[serde(crate = "${vendoredModulePath("serde")}")]`;

  const doc = getDoc(ctx.program, enum_);
  if (doc) yield `#[doc = ${JSON.stringify(doc)}]`;

  yield `pub enum ${enum_.name} {`;

  // TODO: only works properly with string enums. need a different solution
  // for numeric enums and an even differenter solution for float enums.

  for (const [name, member] of enum_.members) {
    const nameCase = parseCase(name);
    const variantName = nameCase.pascalCase;

    const value = member.value ?? name;

    yield `  #[serde(rename = ${JSON.stringify(value)})]`;
    yield "  " + variantName + ",";
  }

  yield "}";

  yield "";

  yield "impl core::fmt::Display for " + enum_.name + " {";
  yield "  fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {";
  yield "    match self {";

  for (const [name, member] of enum_.members) {
    const nameCase = parseCase(name);
    const variantName = nameCase.pascalCase;

    const value = member.value ?? name;

    yield `      ${enum_.name}::${variantName} => write!(f, ${JSON.stringify(
      value
    )}),`;
  }

  yield "    }";
  yield "  }";
  yield "}";
  yield "";
}
