export declare const HOST_PACKAGE = "tsp_rust";
export type RustEmitterOutputMode = "directory" | "module";
export type RustEmitterFeature = "http";
export interface RustEmitterOptions {
    "tsp-rust-crate": string;
    "output-mode": RustEmitterOutputMode;
    features: RustEmitterFeature[];
    "omit-unreachable-types": boolean;
}
export declare const $lib: import("@typespec/compiler").TypeSpecLibrary<{
    "unrecognized-scalar": {
        default: import("@typespec/compiler").CallableMessage<[string]>;
    };
    "unrecognized-encoding": {
        default: import("@typespec/compiler").CallableMessage<[string, string]>;
    };
}, RustEmitterOptions, never>;
declare const reportDiagnostic: <C extends "unrecognized-scalar" | "unrecognized-encoding", M extends keyof {
    "unrecognized-scalar": {
        default: import("@typespec/compiler").CallableMessage<[string]>;
    };
    "unrecognized-encoding": {
        default: import("@typespec/compiler").CallableMessage<[string, string]>;
    };
}[C]>(program: import("@typespec/compiler").Program, diag: import("@typespec/compiler").DiagnosticReport<{
    "unrecognized-scalar": {
        default: import("@typespec/compiler").CallableMessage<[string]>;
    };
    "unrecognized-encoding": {
        default: import("@typespec/compiler").CallableMessage<[string, string]>;
    };
}, C, M>) => void;
export { reportDiagnostic };
