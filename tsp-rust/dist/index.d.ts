import { EmitContext } from "@typespec/compiler";
export { $lib } from "./lib.js";
export declare const namespace = "TypeSpec";
export declare function $onEmit(context: EmitContext): Promise<void>;
