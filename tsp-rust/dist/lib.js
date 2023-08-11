import { createTypeSpecLibrary, paramMessage, } from "@typespec/compiler";
export const HOST_PACKAGE = "tsp_rust";
const EmitterOptionsSchema = {
    type: "object",
    additionalProperties: false,
    properties: {},
    required: [],
};
export const $lib = createTypeSpecLibrary({
    name: "tsp-rust",
    requireImports: [],
    emitter: {
        options: EmitterOptionsSchema,
    },
    diagnostics: {
        "invalid-scalar": {
            severity: "error",
            messages: {
                default: paramMessage `scalar ${"scalar"} is not supported in Rust`,
            },
        },
    },
});
const { reportDiagnostic } = $lib;
export { reportDiagnostic };
//# sourceMappingURL=lib.js.map