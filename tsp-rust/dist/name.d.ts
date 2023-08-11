import { Namespace, Type } from "@typespec/compiler";
export type NamespacedType = Extract<Type, {
    namespace?: Namespace | undefined;
}>;
export declare function getFullyQualifiedTypeName(type: NamespacedType): string;
