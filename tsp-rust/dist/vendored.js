import { HOST_PACKAGE } from "./lib.js";
export function referencePath(...segments) {
    return "::" + [HOST_PACKAGE, ...segments].join("::");
}
export function vendoredModulePath(...segments) {
    return referencePath("vendored", ...segments);
}
//# sourceMappingURL=vendored.js.map