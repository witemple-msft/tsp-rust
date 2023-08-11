import { Model } from "@typespec/compiler";
import { RustContext } from "./ctx.js";
import { RustTranslation } from "./scalars.js";
export declare function emitModels(ctx: RustContext): Iterable<string>;
export declare function emitModel(ctx: RustContext, model: Model, altName?: string): Iterable<string>;
export declare function isWellKnownModel(ctx: RustContext, type: Model): boolean;
export declare function emitWellKnownModel(ctx: RustContext, type: Model, disposition: keyof RustTranslation, prefix: string, preferredAlternativeName: string): string;
