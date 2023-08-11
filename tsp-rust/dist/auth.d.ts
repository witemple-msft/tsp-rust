import { RustContext } from "./ctx.js";
export interface AuthCode {
    fields: string[];
    config_lines: string[];
    declarations: string[];
}
export declare function generateAuth(ctx: RustContext): AuthCode;
