import { HttpOperationResponse } from "@typespec/http";
import { RustContext } from "./ctx.js";
import { ReCase } from "./case.js";
export interface ResultInfo {
    readonly returnType: string;
    readonly result: string[];
}
export declare function createResultInfo(ctx: RustContext, responses: HttpOperationResponse[], operationCase: ReCase): ResultInfo;
