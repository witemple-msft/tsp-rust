import { parseCase } from "./case.js";
import { RustContext } from "./ctx.js";
import { vendoredModulePath } from "./vendored.js";

export interface AuthCode {
  fields: string[];
  config_lines: string[];
  declarations: string[];
}

export function generateAuth(ctx: RustContext): AuthCode {
  const auth = ctx.authenticationInfo;
  if (!auth) {
    return {
      config_lines: [],
      fields: [],
      declarations: [],
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
      const id =
        scheme.id.endsWith("Auth") || scheme.id.endsWith("auth")
          ? scheme.id.slice(0, -4)
          : scheme.id;
      const idCase = parseCase(id);
      const structName = idCase.pascalCase;
      return {
        config_lines: [`pub api_key: auth::${structName},`],
        fields: ["api_key"],
        declarations: [
          "pub mod auth {",
          `  pub struct ${structName} {`,
          `    key: ${vendoredModulePath("sec", "Secret")},`,
          "  }",
          "  ",
          `  impl ${structName} {`,
          "    pub fn new(key: &str) -> Self {",
          "      Self {",
          // prettier-ignore
          `        key: ${vendoredModulePath("sec", "Secret")}::new(key.to_string())`,
          "      }",
          "    }",
          "  }",
          "}",
          "",
        ],
      };
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
