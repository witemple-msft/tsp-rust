import { Type, DiagnosticTarget, NoTarget } from "@typespec/compiler";
import { RustContext } from "./ctx.js";
import { RustTranslation } from "./scalars.js";
export declare function emitTypeReference(ctx: RustContext, type: Type, position: DiagnosticTarget | typeof NoTarget, disposition: keyof RustTranslation, prefix: string, preferredAlternativeName: string): string;
