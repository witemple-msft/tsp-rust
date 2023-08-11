import { getEffectiveModelType, } from "@typespec/compiler";
import { getRustScalar } from "./scalars.js";
import { vendoredModulePath } from "./vendored.js";
import { emitWellKnownModel, isWellKnownModel } from "./model.js";
export function emitTypeReference(ctx, type, position, disposition, prefix, preferredAlternativeName) {
    switch (type.kind) {
        case "Scalar":
            return getRustScalar(ctx.program, type, position)[disposition];
        case "Model": {
            if (isWellKnownModel(ctx, type)) {
                return emitWellKnownModel(ctx, type, disposition, prefix, preferredAlternativeName);
            }
            let effectiveModel = getEffectiveModelType(ctx.program, type);
            if (effectiveModel.name === "") {
                // Anonymous model, synthesize a new model with the preferredName
                ctx.synthetics.push({
                    name: preferredAlternativeName,
                    underlying: effectiveModel,
                });
                return prefix + "synthetic::" + preferredAlternativeName;
            }
            else if (!ctx.visitedModels.has(effectiveModel)) {
                ctx.visitedModels.add(effectiveModel);
                ctx.modelQueue.push(effectiveModel);
            }
            return prefix + effectiveModel.name;
        }
        case "Union":
            return 'todo!("union")';
        case "Enum":
            return 'todo!("enum")';
        case "Number":
            return "f64";
        case "String":
            return "String";
        case "Boolean":
            return "bool";
        case "Intrinsic":
            switch (type.name) {
                case "never":
                    return "!";
                case "null":
                case "void":
                    return "()";
                case "ErrorType":
                    return `compile_error!("ErrorType")`;
                case "unknown":
                    return vendoredModulePath("serde_json", "Value");
            }
        default:
            throw new Error(`UNREACHABLE: ${type.kind}`);
    }
}
//# sourceMappingURL=reference.js.map