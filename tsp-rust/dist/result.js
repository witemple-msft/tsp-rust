import { bifilter } from "./bifilter.js";
import { isErrorModel } from "@typespec/compiler";
import { indent } from "./indent.js";
import { emitTypeReference } from "./reference.js";
export function createResultInfo(ctx, responses, operationCase) {
    const [successResponses, errorResponses] = bifilter(responses, function isErrorResponse(resp) {
        return !isErrorModel(ctx.program, resp.type);
    });
    if (successResponses.length > 1 ||
        errorResponses.length > 1 ||
        successResponses[0].responses.length > 1 ||
        errorResponses[0].responses.length > 1) {
        // TODO
        throw new Error("Multiple responses not supported");
    }
    const successResponse = successResponses[0].responses[0];
    const errorResponse = errorResponses[0].responses[0];
    // Cases:
    // - Response has headers - must synthesize a response type that merges the body
    // - Response has no headers
    //   - Response has no body, return "()"
    //   - Response has a body, return the body type directly -- could be breaking if
    //     headers are added later and the response shape changes
    if (successResponse.headers || errorResponse.headers) {
        console.warn("Ignoring response headers...");
    }
    const successTypeReference = successResponse.body === undefined
        ? "()"
        : emitTypeReference(ctx, successResponse.body.type, successResponse.body.type, "owned", "models::", operationCase.pascalCase + "Response");
    // prettier-ignore
    const output = [
        "let status = res.status();",
        "",
        "match status.as_u16() {"
    ];
    for (const response of responses) {
        output.push(`  ${codeToExprOrPattern(response.statusCode)} => {`);
        if (response.responses.length !== 1) {
            throw new Error(`Number of respones not supported, expected 1 got ${response.responses.length}`);
        }
        const responseContent = response.responses[0];
        if (isErrorModel(ctx.program, response.type)) {
        }
        else {
        }
        output.push(...indent(indent(emitErrorProcessingCode(ctx, responseContent, operationCase))));
        output.push("  },");
    }
    output.push(`  ${codeToExprOrPattern(successResponses[0].statusCode)} => {`);
    output.push(...indent(indent(emitSuccessProcessingCode(ctx, successResponse, operationCase))));
    output.push("  },");
    output.push(`  ${codeToExprOrPattern(errorResponses[0].statusCode)} => {`);
    output.push(...indent(indent(emitErrorProcessingCode(ctx, errorResponse, operationCase))));
    output.push("  },");
    output.push("}");
    return {
        returnType: `Result<${successTypeReference}, error::RequestError<${ctx.errorTypeName}>>`,
        result: output,
    };
}
function codeToExprOrPattern(code) {
    if (code === "*") {
        return "status";
    }
    return code;
}
function* emitSuccessProcessingCode(ctx, response, operationCase) {
    if (response.body) {
        yield `let body = res.json::<${emitTypeReference(ctx, response.body?.type, response.body?.type, "owned", "models::", operationCase.pascalCase + "ResponseBody")}>().await?;`;
        yield "";
        yield "Ok(body)";
    }
    else {
        yield "Ok(())";
    }
}
function* emitErrorProcessingCode(ctx, response, operationCase) {
    if (response.body) {
        yield `let body = res.json::<${emitTypeReference(ctx, response.body?.type, response.body?.type, "owned", "models::", operationCase.pascalCase + "ErrorResponseBody")}>().await?;`;
        yield "";
        yield "Err(error::RequestError::Service(status, body))";
    }
    else {
        yield "Err(error::RequestError::Service(status, ()))";
    }
}
//# sourceMappingURL=result.js.map