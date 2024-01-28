import "source-map-support/register.js";
import { EmitContext } from "@typespec/compiler";
import { RustEmitterOptions } from "./lib.js";
export { $lib } from "./lib.js";
export declare const namespace = "TypeSpec";
export declare function $onEmit(context: EmitContext<RustEmitterOptions>): Promise<void>;
