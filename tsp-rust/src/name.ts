import { Namespace, Type, getNamespaceFullName } from "@typespec/compiler";

export type NamespacedType = Extract<
  Type,
  { namespace?: Namespace | undefined }
>;

export function getFullyQualifiedTypeName(type: NamespacedType): string {
  const name = type.name ?? "<unknown>";
  if (type.namespace) {
    return getNamespaceFullName(type.namespace) + "." + name;
  } else {
    return name;
  }
}
