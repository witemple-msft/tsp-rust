import { Enum, Interface, Model, Namespace, Program, Scalar, Service, Union } from "@typespec/compiler";
import { HttpOperationParameter, HttpService, ServiceAuthentication } from "@typespec/http";
import { OnceQueue } from "./util/onceQueue.js";
export type RustVisibility = "pub" | "pub(crate)" | "pub(mod)" | "pub(super)" | "";
export type RustDeclarationType = Model | Enum | Union | Interface | Scalar;
export interface RustContext {
    program: Program;
    service: Service;
    httpService: HttpService;
    serviceTitle?: string;
    serviceVersion?: string;
    authenticationInfo?: ServiceAuthentication;
    contextTypeName: string;
    errorTypeName: string;
    typeQueue: OnceQueue<RustDeclarationType>;
    synthetics: Synthetic[];
    syntheticNames: Map<RustDeclarationType, string>;
    options: OptionsStructDefinition[];
    baseNamespace: Namespace;
    namespaceModules: Map<Namespace, Module>;
}
export interface Synthetic {
    name: string;
    underlying: RustDeclarationType;
}
export interface OptionsStructDefinition {
    name: string;
    fields: HttpOperationParameter[];
}
export type ModuleBodyDeclaration = string[] | string | Module;
export declare function isModule(value: unknown): value is Module;
export interface Module {
    name: string;
    cursor: PathCursor;
    namespace?: Namespace;
    visibility: RustVisibility;
    inline: boolean;
    declarations: ModuleBodyDeclaration[];
}
export interface PathCursor {
    readonly path: string[];
    readonly models: string;
    readonly synthetic: string;
    enter(...path: string[]): PathCursor;
    resolveAbsolutePath(...other: string[]): string;
}
export declare function createPathCursor(...base: string[]): PathCursor;
export declare function getCursorForNamespace(ctx: RustContext, namespace: Namespace): PathCursor;
