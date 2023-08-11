import { getNamespaceFullName } from "@typespec/compiler";
export function getFullyQualifiedTypeName(type) {
    const name = type.name ?? "<unknown>";
    if (type.namespace) {
        return getNamespaceFullName(type.namespace) + "." + name;
    }
    else {
        return name;
    }
}
//# sourceMappingURL=name.js.map