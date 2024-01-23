import { Enum, Model, Program, Union } from "@typespec/compiler";
import {
  HttpOperationParameter,
  HttpService,
  ServiceAuthentication,
} from "@typespec/http";

export type RustDeclarationType = Model | Enum | Union;

export interface RustContext {
  program: Program;
  service: HttpService;
  serviceTitle?: string;
  serviceVersion?: string;
  authenticationInfo?: ServiceAuthentication;

  contextTypeName: string;
  errorTypeName: string;

  typeQueue: RustDeclarationType[];
  visitedTypes: Set<RustDeclarationType>;
  synthetics: Synthetic[];
  syntheticNames: Map<RustDeclarationType, string>;

  options: OptionsStructDefinition[];
}

export interface Synthetic {
  name: string;
  underlying: RustDeclarationType;
}

export interface OptionsStructDefinition {
  name: string;
  fields: HttpOperationParameter[];
}

export interface PathCursor {
  readonly path: string[];

  readonly models: string;
  readonly synthetic: string;

  enter(name: string): PathCursor;
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

    enter(name: string) {
      return createPathCursor(...self.path, name);
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
