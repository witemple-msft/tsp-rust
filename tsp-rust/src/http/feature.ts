import { JSONSchemaType } from "@typespec/compiler";
import { Module, RustContext } from "../ctx.js";
import { UnimplementedError } from "../util/error.js";
import { registerFeature } from "../feature.js";

declare global {
  interface RustEmitterFeature {
    http: HttpOptions;
  }
}

export interface HttpOptions {}

const HttpOptionsSchema: JSONSchemaType<RustEmitterFeature["http"]> = {
  type: "object",
  properties: {},
  required: [],
  nullable: true,
};

registerFeature("http", HttpOptionsSchema, emitHttp);

async function emitHttp(ctx: RustContext, options: RustEmitterFeature["http"]) {
  const httpModule: Module = {
    name: "http",
    cursor: ctx.rootModule.cursor.enter("http"),

    declarations: [],

    visibility: "pub",
    inline: false,
  };

  ctx.rootModule.declarations.push(httpModule);
}
