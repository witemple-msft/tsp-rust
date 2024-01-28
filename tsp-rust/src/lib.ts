import {
  JSONSchemaType,
  createTypeSpecLibrary,
  paramMessage,
} from "@typespec/compiler";

// TODO: don't want this to be hard coded but overridable in options
export const HOST_PACKAGE = "tsp_rust";

export type RustEmitterOutputMode = "directory" | "module";

export type RustEmitterFeature = "http";

export interface RustEmitterOptions {
  "tsp-rust-crate": string;
  "output-mode": RustEmitterOutputMode;
  features: RustEmitterFeature[];
  "omit-unreachable-types": boolean;
}

const EmitterOptionsSchema: JSONSchemaType<RustEmitterOptions> = {
  type: "object",
  additionalProperties: false,
  properties: {
    "tsp-rust-crate": {
      type: "string",
      default: "::tsp_rust",
    },
    "output-mode": {
      type: "string",
      enum: ["directory", "module"],
      default: "directory",
    },
    features: {
      type: "array",
      items: {
        type: "string",
        enum: ["http"],
      },
      default: [],
    },
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
