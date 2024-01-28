import { Namespace, Type, getNamespaceFullName } from "@typespec/compiler";

export type NamespacedType = Extract<
  Type,
  { namespace?: Namespace | undefined }
>;

export function getFullyQualifiedTypeName(type: NamespacedType): string {
  const name = type.name ?? "<unknown>";
  if (type.namespace) {
    return (
      getFullyQualifiedNamespacePath(type.namespace).join(".") + "." + name
    );
  } else {
    return name;
  }
}

export function getFullyQualifiedNamespacePath(ns: Namespace): string[] {
  if (ns.namespace) {
    const innerPath = getFullyQualifiedNamespacePath(ns.namespace);
    innerPath.push(ns.name);
    return innerPath;
  } else {
    return [ns.name];
  }
}
