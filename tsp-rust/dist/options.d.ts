import { RustContext, OptionsStructDefinition } from "./ctx.js";
export declare function emitOptions(ctx: RustContext): Iterable<string>;
export declare function emitOptionsStruct(ctx: RustContext, option: OptionsStructDefinition): Iterable<string>;
