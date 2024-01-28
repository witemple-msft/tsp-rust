import {
  Enum,
  Interface,
  Model,
  Namespace,
  Program,
  Scalar,
  Service,
  Union,
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
  resolveAbsolutePath(...other: string[]): string;
}

const MODELS_PATH = ["models"];
const SYNTHETIC_PATH = ["models", "synthetic"];

export function createPathCursor(...base: string[]): PathCursor {
  const self: PathCursor = {
    path: base,

    get models() {
      return self.resolveAbsolutePath(...MODELS_PATH);
    },

    get synthetic() {
      return self.resolveAbsolutePath(...SYNTHETIC_PATH);
    },

    enter(...path: string[]) {
      return createPathCursor(...self.path, ...path);
    },

    // Should resolve using path logic, like path.resolve. If paths have a common prefix, it should be removed and
    // instead of ".." relative paths, the Rust path syntax uses "super".
    resolveAbsolutePath(...absolute: string[]) {
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
