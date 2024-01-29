import { JSONSchemaType } from "@typespec/compiler";
import { RustContext } from "./ctx.js";

declare global {
  interface RustEmitterFeature {}
}

export const RustEmitterFeatureOptionsSchema = {
  type: "object",
  additionalProperties: false,
  properties: {},
  required: [],
} as object as JSONSchemaType<RustEmitterFeature>;

export type RustEmitterFeatureHandler<Options> = (
  ctx: RustContext,
  options: Options
) => Promise<void>;

const __FEATURE_HANDLERS: Map<
  string,
  RustEmitterFeatureHandler<any>
> = new Map();

export function registerFeature<Name extends keyof RustEmitterFeature>(
  name: Name,
  optionsSchema: JSONSchemaType<RustEmitterFeature[Name]>,
  handler: RustEmitterFeatureHandler<RustEmitterFeature[Name]>
) {
  if (__FEATURE_HANDLERS.has(name)) {
    throw new Error(`registerFeature: feature '${name}' already registered`);
  }

  __FEATURE_HANDLERS.set(name, handler);

  RustEmitterFeatureOptionsSchema.properties[name] = optionsSchema;
}

export function getFeatureHandler<Name extends keyof RustEmitterFeature>(
  name: Name
): RustEmitterFeatureHandler<RustEmitterFeature[Name]> {
  const h = __FEATURE_HANDLERS.get(name);

  if (!h)
    throw new Error(`getFeatureHandler: feature '${name}' not registered`);

  return h;
}
