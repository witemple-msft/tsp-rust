import {
  JSONSchemaType,
  createTypeSpecLibrary,
  paramMessage,
} from "@typespec/compiler";
import { RustEmitterFeatureOptionsSchema } from "./feature.js";

export type RustEmitterOutputMode = "directory" | "module";

export interface RustEmitterOptions {
  "crate-path"?: string;
  "output-mode"?: RustEmitterOutputMode;
  features: RustEmitterFeature;
  "omit-unreachable-types": boolean;
}

export const DEFAULT_OUTPUT_MODE: RustEmitterOutputMode = "directory";
export const DEFAULT_CRATE_PATH = "::tsp_rust";

const EmitterOptionsSchema: JSONSchemaType<RustEmitterOptions> = {
  type: "object",
  additionalProperties: false,
  properties: {
    "crate-path": {
      type: "string",
      default: DEFAULT_CRATE_PATH,
      nullable: true,
    },
    "output-mode": {
      type: "string",
      enum: ["directory", "module"],
      default: DEFAULT_OUTPUT_MODE,
      nullable: true,
    },
    features: RustEmitterFeatureOptionsSchema,
    "omit-unreachable-types": {
      type: "boolean",
      default: false,
    },
  },
  required: [],
};

export const $lib = createTypeSpecLibrary({
  name: "tsp-rust",
  requireImports: [],
  emitter: {
    options: EmitterOptionsSchema,
  },
  diagnostics: {
    "unrecognized-scalar": {
      severity: "error",
      messages: {
        default: paramMessage`unrecognized scalar '${"scalar"}'`,
      },
    },
    "unrecognized-encoding": {
      severity: "error",
      messages: {
        default: paramMessage`unrecognized encoding '${"encoding"}' for type '${"type"}'`,
      },
    },
  },
});

const { reportDiagnostic } = $lib;

export { reportDiagnostic };
