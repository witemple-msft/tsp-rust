import { DiagnosticTarget, NoTarget, Program, Scalar } from "@typespec/compiler";
export interface RustTranslation {
    owned: string;
    borrowed: string;
    param: string;
}
export declare function getRustScalar(program: Program, scalar: Scalar, diagnosticTarget: DiagnosticTarget | typeof NoTarget): RustTranslation;
