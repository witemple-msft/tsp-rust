export declare const HOST_PACKAGE = "tsp_rust";
export interface RustClientEmitterOptions {
}
export declare const $lib: import("@typespec/compiler").TypeSpecLibrary<{
    "invalid-scalar": {
        default: import("@typespec/compiler").CallableMessage<[string]>;
    };
}, RustClientEmitterOptions>;
declare const reportDiagnostic: <C extends "invalid-scalar", M extends keyof {
    "invalid-scalar": {
        default: import("@typespec/compiler").CallableMessage<[string]>;
    };
}[C]>(program: import("@typespec/compiler").Program, diag: import("@typespec/compiler").DiagnosticReport<{
    "invalid-scalar": {
        default: import("@typespec/compiler").CallableMessage<[string]>;
    };
}, C, M>) => void;
export { reportDiagnostic };
