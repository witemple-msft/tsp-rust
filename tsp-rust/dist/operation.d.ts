import { HttpOperation } from "@typespec/http";
import { RustContext } from "./ctx.js";
export declare function emitOperations(ctx: RustContext): Iterable<string>;
export declare function emitOperation(ctx: RustContext, operation: HttpOperation): Iterable<string>;
