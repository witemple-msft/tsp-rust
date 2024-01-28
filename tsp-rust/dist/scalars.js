import { formatDiagnostic, } from "@typespec/compiler";
import { vendoredModulePath } from "./vendored.js";
import { reportDiagnostic } from "./lib.js";
import { getFullyQualifiedTypeName } from "./name.js";
let _RUST_SCALARS_MAP = new Map();
function copy(owned) {
    return {
        owned,
        borrowed: owned,
        param: owned,
    };
}
function owned(owned) {
    return ob(owned, `&${owned}`);
}
function ob(owned, borrowed) {
    return {
        owned,
        borrowed,
        param: borrowed,
    };
}
function obp(owned, borrowed, param) {
    return {
        owned,
        borrowed,
        param,
    };
}
function getScalarsMap(program) {
    let scalars = _RUST_SCALARS_MAP.get(program);
    if (scalars === undefined) {
        scalars = createScalarsMap(program);
        _RUST_SCALARS_MAP.set(program, scalars);
    }
    return scalars;
}
function createScalarsMap(program) {
    const entries = [
        [program.resolveTypeReference("TypeSpec.bytes"), ob("Vec<u8>", "&[u8]")],
        [program.resolveTypeReference("TypeSpec.boolean"), copy("bool")],
        // [
        //   program.resolveTypeReference("TypeSpec.string"),
        //   obp("String", "&str", "impl Into<String>"),
        // ],
        [program.resolveTypeReference("TypeSpec.string"), ob("String", "&str")],
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
            copy(vendoredModulePath("chrono", "naive", "NaiveDate")),
        ],
        [
            program.resolveTypeReference("TypeSpec.plainTime"),
            copy(vendoredModulePath("chrono", "naive", "NaiveTime")),
        ],
        [
            program.resolveTypeReference("TypeSpec.utcDateTime"),
            copy(vendoredModulePath("chrono", `DateTime<${vendoredModulePath("chrono", "offset", "Utc")}>`)),
        ],
        // [program.resolveTypeReference("TypeSpec.offsetDateTime"), copy(vendoredModulePath("chrono", "DateTime"))],
        [
            program.resolveTypeReference("TypeSpec.duration"),
            copy(vendoredModulePath("chrono", "Duration")),
        ],
        [
            program.resolveTypeReference("TypeSpec.decimal"),
            copy(vendoredModulePath("bigdecimal", "BigDecimal")),
        ],
    ];
    for (const [[type, diagnostics]] of entries) {
        if (!type) {
            const diagnosticString = diagnostics.map(formatDiagnostic).join("\n");
            throw new Error(`Failed to construct TypeSpec -> Rust scalar map: ${diagnosticString}`);
        }
        else if (type.kind !== "Scalar") {
            throw new Error(`type is not a scalar: ${type.kind}: ${type.name}`);
        }
    }
    return new Map(entries.map(([[type], scalar]) => [type, scalar]));
}
export function getRustScalar(program, scalar, diagnosticTarget) {
    const scalars = getScalarsMap(program);
    let _scalar = scalar;
    while (_scalar !== undefined) {
        const rustScalar = scalars.get(_scalar);
        if (rustScalar !== undefined) {
            return rustScalar;
        }
        _scalar = _scalar.baseScalar;
    }
    reportDiagnostic(program, {
        code: "invalid-scalar",
        target: diagnosticTarget,
        format: {
            scalar: getFullyQualifiedTypeName(scalar),
        },
    });
    return copy("()");
}
//# sourceMappingURL=scalars.js.map