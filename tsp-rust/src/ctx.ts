import {
  Enum,
  Interface,
  Model,
  Namespace,
  Program,
  Scalar,
  Service,
  Union,
  UnionVariant,
} from "@typespec/compiler";
import {
  HttpOperationParameter,
  HttpService,
  ServiceAuthentication,
} from "@typespec/http";
import { parseCase } from "./util/case.js";
import { OnceQueue } from "./util/onceQueue.js";

export type RustVisibility =
  | "pub"
  | "pub(crate)"
  | "pub(mod)"
  | "pub(super)"
  | "";

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

  // new stuff
  rootModule: Module;
  baseNamespace: Namespace;
  namespaceModules: Map<Namespace, Module>;
  syntheticUnions: Set<string>;
}

export type Synthetic = AnonymousSynthetic | PartialUnionSynthetic;

export interface AnonymousSynthetic {
  kind: "anonymous";
  name: string;
  underlying: RustDeclarationType;
}

export interface PartialUnionSynthetic {
  kind: "partialUnion";
  name: string;
  variants: UnionVariant[];
}

export interface OptionsStructDefinition {
  name: string;
  fields: HttpOperationParameter[];
}

// #region Module

export type ModuleBodyDeclaration = string[] | string | Module;

export function isModule(value: unknown): value is Module {
  return (
    typeof value === "object" &&
    value !== null &&
    "declarations" in value &&
    Array.isArray(value.declarations)
  );
}

export interface Module {
  name: string;
  cursor: PathCursor;
  namespace?: Namespace;

  visibility: RustVisibility;
  inline: boolean;

  declarations: ModuleBodyDeclaration[];
}

// #endregion

export interface PathCursor {
  readonly path: string[];

  readonly models: string;
  readonly synthetic: string;

  enter(...path: string[]): PathCursor;
  /** @deprecated use pathTo instead */
  resolveAbsolutePathOld(...other: string[]): string;
  pathTo(other: PathCursor, childItem?: string): string;
}

const MODELS_PATH = ["models"];
const SYNTHETIC_PATH = ["models", "synthetic"];

export function createPathCursor(...base: string[]): PathCursor {
  const self: PathCursor = {
    path: base,

    get models() {
      return self.resolveAbsolutePathOld(...MODELS_PATH);
    },

    get synthetic() {
      return self.resolveAbsolutePathOld(...SYNTHETIC_PATH);
    },

    enter(...path: string[]) {
      return createPathCursor(...self.path, ...path);
    },

    // Should resolve using path logic, like path.resolve. If paths have a common prefix, it should be removed and
    // instead of ".." relative paths, the Rust path syntax uses "super".
    /**
     *
     * @deprecated
     * @param absolute
     * @returns
     */
    resolveAbsolutePathOld(...absolute: string[]) {
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

    pathTo(other: PathCursor, childItem?: string): string {
      const commonPrefix = getCommonPrefix(self.path, other.path);

      const outputPath = [];

      for (let i = 0; i < self.path.length - commonPrefix.length; i++) {
        outputPath.push("super");
      }

      outputPath.push(...other.path.slice(commonPrefix.length));

      const outPath = outputPath.join("::");

      if (outPath === "" && !same(self, other)) {
        throw new Error("Resolved empty module path");
      }

      return childItem !== undefined
        ? outPath === ""
          ? childItem
          : outPath + "::" + childItem
        : outPath;
    },
  };

  return self;

  function same(a: PathCursor, b: PathCursor): boolean {
    return (
      a.path.length === b.path.length && a.path.every((v, i) => v === b.path[i])
    );
  }
}

function getCommonPrefix(a: string[], b: string[]): string[] {
  const prefix = [];

  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      break;
    }

    prefix.push(a[i]);
  }

  return prefix;
}

export function getCursorForNamespace(
  ctx: RustContext,
  namespace: Namespace
): PathCursor {
  const paths = [];

  while (namespace !== ctx.baseNamespace) {
    if (namespace.namespace === undefined)
      throw new Error(
        "Reached top of namespace tree without finding base namespace."
      );

    paths.push(parseCase(namespace.name).snakeCase);
    namespace = namespace.namespace;
  }

  return createPathCursor("models", ...paths.reverse());
}
