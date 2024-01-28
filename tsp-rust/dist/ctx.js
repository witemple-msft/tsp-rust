import { parseCase } from "./util/case.js";
export function isModule(value) {
    return (typeof value === "object" &&
        value !== null &&
        "declarations" in value &&
        Array.isArray(value.declarations));
}
const MODELS_PATH = ["models"];
const SYNTHETIC_PATH = ["models", "synthetic"];
export function createPathCursor(...base) {
    const self = {
        path: base,
        get models() {
            return self.resolveAbsolutePath(...MODELS_PATH);
        },
        get synthetic() {
            return self.resolveAbsolutePath(...SYNTHETIC_PATH);
        },
        enter(...path) {
            return createPathCursor(...self.path, ...path);
        },
        // Should resolve using path logic, like path.resolve. If paths have a common prefix, it should be removed and
        // instead of ".." relative paths, the Rust path syntax uses "super".
        resolveAbsolutePath(...absolute) {
            const commonPrefix = getCommonPrefix(self.path, absolute);
            const outputPath = [];
            for (let i = 0; i < self.path.length - commonPrefix.length; i++) {
                outputPath.push("super");
            }
            outputPath.push(...absolute.slice(commonPrefix.length));
            const outPath = outputPath.join("::");
            if (outPath === "") {
                throw new Error("Resolved empty module path");
            }
            return outPath;
        },
    };
    return self;
}
function getCommonPrefix(a, b) {
    const prefix = [];
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] !== b[i]) {
            break;
        }
        prefix.push(a[i]);
    }
    return prefix;
}
export function getCursorForNamespace(ctx, namespace) {
    const paths = [];
    while (namespace !== ctx.baseNamespace) {
        if (namespace.namespace === undefined)
            throw new Error("Reached top of namespace tree without finding base namespace.");
        paths.push(parseCase(namespace.name).snakeCase);
        namespace = namespace.namespace;
    }
    return createPathCursor("models", ...paths.reverse());
}
//# sourceMappingURL=ctx.js.map