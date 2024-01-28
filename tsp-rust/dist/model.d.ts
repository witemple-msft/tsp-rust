import { Model } from "@typespec/compiler";
import { PathCursor, RustContext } from "./ctx.js";
import { RustTranslation } from "./scalars.js";
export declare function emitModel(ctx: RustContext, model: Model, cursor: PathCursor, altName?: string): Iterable<string>;
export declare function isWellKnownModel(ctx: RustContext, type: Model): boolean;
export declare function emitWellKnownModel(ctx: RustContext, type: Model, disposition: keyof RustTranslation, cursor: PathCursor, preferredAlternativeName: string): string;
