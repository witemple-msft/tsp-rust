import {
  DiagnosticTarget,
  NoTarget,
  Program,
  Scalar,
  formatDiagnostic,
} from "@typespec/compiler";
import { referenceVendoredHostPath } from "../util/vendored.js";
import { reportDiagnostic } from "../lib.js";
import { getFullyQualifiedTypeName } from "../util/name.js";
import { RustContext } from "../ctx.js";
import { parseCase } from "../util/case.js";

export function emitScalar(ctx: RustContext, scalar: Scalar): string {
  const rustScalar = getRustScalar(ctx.program, scalar, scalar.node.id);

  const name = parseCase(scalar.name).pascalCase;

  return `pub type ${name} = ${rustScalar.owned};`;
}

let _RUST_SCALARS_MAP = new Map<Program, Map<Scalar, RustTranslation>>();

export interface RustTranslation {
  owned: string;
  borrowed: string;
  param: string;
}

function copy(owned: string): RustTranslation {
  return {
    owned,
    borrowed: owned,
    param: owned,
  };
}

function owned(owned: string): RustTranslation {
  return ob(owned, `&${owned}`);
}

function ob(owned: string, borrowed: string): RustTranslation {
  return {
    owned,
    borrowed,
    param: borrowed,
  };
}

function obp(owned: string, borrowed: string, param: string): RustTranslation {
  return {
    owned,
    borrowed,
    param,
  };
}

function getScalarsMap(program: Program): Map<Scalar, RustTranslation> {
  let scalars = _RUST_SCALARS_MAP.get(program);

  if (scalars === undefined) {
    scalars = createScalarsMap(program);
    _RUST_SCALARS_MAP.set(program, scalars);
  }

  return scalars;
}

function createScalarsMap(program: Program): Map<Scalar, RustTranslation> {
  const entries = [
    [
      program.resolveTypeReference("TypeSpec.bytes"),
      obp("Vec<u8>", "&[u8]", "impl AsRef<[u8]>"),
    ],
    [program.resolveTypeReference("TypeSpec.boolean"), copy("bool")],
    // [
    //   program.resolveTypeReference("TypeSpec.string"),
    //   obp("String", "&str", "impl Into<String>"),
    // ],
    [
      program.resolveTypeReference("TypeSpec.string"),
      obp("String", "&str", "impl AsRef<str>"),
    ],
    // [program.resolveTypeReference("TypeSpec.usize"), copy("usize")],
    // [program.resolveTypeReference("TypeSpec.isize"), copy("isize")],
    [program.resolveTypeReference("TypeSpec.int64"), copy("i64")],
    [program.resolveTypeReference("TypeSpec.int32"), copy("i32")],
    [program.resolveTypeReference("TypeSpec.int16"), copy("i16")],
    [program.resolveTypeReference("TypeSpec.int8"), copy("i8")],
    [program.resolveTypeReference("TypeSpec.uint64"), copy("u64")],
    [program.resolveTypeReference("TypeSpec.uint32"), copy("u32")],
    [program.resolveTypeReference("TypeSpec.uint16"), copy("u16")],
    [program.resolveTypeReference("TypeSpec.uint8"), copy("u8")],
    [program.resolveTypeReference("TypeSpec.float32"), copy("f32")],
    [program.resolveTypeReference("TypeSpec.float64"), copy("f64")],
    [program.resolveTypeReference("TypeSpec.integer"), copy("isize")],
    [
      program.resolveTypeReference("TypeSpec.plainDate"),
      copy(referenceVendoredHostPath("chrono", "naive", "NaiveDate")),
    ],
    [
      program.resolveTypeReference("TypeSpec.plainTime"),
      copy(referenceVendoredHostPath("chrono", "naive", "NaiveTime")),
    ],
    [
      program.resolveTypeReference("TypeSpec.utcDateTime"),
      copy(
        referenceVendoredHostPath(
          "chrono",
          `DateTime<${referenceVendoredHostPath("chrono", "offset", "Utc")}>`
        )
      ),
    ],
    // [program.resolveTypeReference("TypeSpec.offsetDateTime"), copy(vendoredModulePath("chrono", "DateTime"))],
    [
      program.resolveTypeReference("TypeSpec.duration"),
      copy(referenceVendoredHostPath("chrono", "Duration")),
    ],
    [
      program.resolveTypeReference("TypeSpec.decimal"),
      copy(referenceVendoredHostPath("bigdecimal", "BigDecimal")),
    ],
  ] as const;

  for (const [[type, diagnostics]] of entries) {
    if (!type) {
      const diagnosticString = diagnostics.map(formatDiagnostic).join("\n");
      throw new Error(
        `failed to construct TypeSpec -> Rust scalar map: ${diagnosticString}`
      );
    } else if (type.kind !== "Scalar") {
      throw new Error(
        `type ${(type as any).name ?? "<anonymous>"} is a '${
          type.kind
        }', expected 'scalar'`
      );
    }
  }

  return new Map<Scalar, RustTranslation>(
    entries.map(([[type], scalar]) => [type! as Scalar, scalar])
  );
}

export function getRustScalar(
  program: Program,
  scalar: Scalar,
  diagnosticTarget: DiagnosticTarget | typeof NoTarget
): RustTranslation {
  const scalars = getScalarsMap(program);

  let _scalar: Scalar | undefined = scalar;

  while (_scalar !== undefined) {
    const rustScalar = scalars.get(_scalar);

    if (rustScalar !== undefined) {
      return rustScalar;
    }

    _scalar = _scalar.baseScalar;
  }

  reportDiagnostic(program, {
    code: "unrecognized-scalar",
    target: diagnosticTarget,
    format: {
      scalar: getFullyQualifiedTypeName(scalar),
    },
  });

  const scalarName = getFullyQualifiedTypeName(scalar);

  return copy(
    `compile_error!("unrecognized base scalar type '${scalarName}'")`
  );
}
