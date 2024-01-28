import { Type, DiagnosticTarget, NoTarget } from "@typespec/compiler";
import { PathCursor, RustContext } from "./ctx.js";
import { RustTranslation } from "./scalars.js";
export declare function emitTypeReference(ctx: RustContext, type: Type, position: DiagnosticTarget | typeof NoTarget, disposition: keyof RustTranslation, cursor: PathCursor, preferredAlternativeName: string): string;
export declare function isValueLiteralType(t: Type): boolean;
