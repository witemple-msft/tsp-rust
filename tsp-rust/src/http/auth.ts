import { ApiKeyAuth } from "@typespec/http";
import { parseCase } from "../util/case.js";
import { RustContext } from "../ctx.js";
import { vendoredModulePath } from "../util/vendored.js";

export interface AuthCode {
  fields: string[];
  config_lines: string[];
  declarations: string[];
  headers: [string, string][];
}

//TODO: why isn't this exposed in @typespec/http?
type ApiKeyLocation = "header" | "query" | "cookie";

export function generateAuth(ctx: RustContext): AuthCode {
  const auth = ctx.authenticationInfo;
  if (!auth) {
    return {
      config_lines: [],
      fields: [],
      declarations: [],
      headers: [],
    };
  }

  if (auth.options.length > 1) {
    // TODO
    console.error("Only one authentication option is supported");
  }

  const option = auth.options[0];

  if (option.schemes.length > 1) {
    // TODO
    throw new Error("Only one authentication scheme is supported");
  }

  const scheme = option.schemes[0];

  switch (scheme.type) {
    case "apiKey": {
      return generateApiKeyAuth(scheme);
    }
    case "http":
    //   return generateHttpAuth(ctx, option);
    case "oauth2":
    //   return generateOAuth2Auth(ctx, option);
    default:
      throw new Error(
        `Unsupported authentication scheme: ${(scheme as any).type}`
      );
  }
}

function generateApiKeyAuth(
  scheme: ApiKeyAuth<ApiKeyLocation, string>
): AuthCode {
  const id =
    scheme.id.endsWith("Auth") || scheme.id.endsWith("auth")
      ? scheme.id.slice(0, -4)
      : scheme.id;
  const idCase = parseCase(id);
  const structName = idCase.pascalCase;

  if (scheme.in !== "header") {
    throw new Error("TODO: only header auth is supported");
  }

  const headerValuePath = vendoredModulePath(
    "reqwest",
    "header",
    "HeaderValue"
  );

  return {
    config_lines: [`pub api_key: auth::${structName},`],
    fields: ["api_key"],
    headers: [[scheme.name, `ctx.api_key.as_header_value()`]],
    declarations: [
      "pub mod auth {",
      `  pub struct ${structName} {`,
      `    key: String,`,
      "  }",
      "  ",
      `  impl ${structName} {`,
      "    pub fn new(key: impl AsRef<str>) -> Self {",
      "      Self {",
      // prettier-ignore
      `        key: key.as_ref().to_string()`,
      "      }",
      "    }",
      "",
      `    pub(super) fn as_header_value(&self) -> ${headerValuePath} {`,
      `      ${headerValuePath}::from_str(&self.key).unwrap()`,
      "    }",
      "  }",
      "}",
      "",
    ],
  };
}
