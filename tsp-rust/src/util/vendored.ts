import { HOST_PACKAGE } from "../lib.js";

export function referencePath(...segments: string[]): string {
  return "::" + [HOST_PACKAGE, ...segments].join("::");
}

export function vendoredModulePath(...segments: string[]): string {
  return referencePath("vendored", ...segments);
}
