import { RustContext } from "../ctx.js";

declare const process: { versions?: { node?: unknown } } | undefined;

const IS_NODE = process?.versions?.node !== undefined;

let __RUSTFMT: typeof import("../node/rustfmt.js") | undefined = undefined;

let __HAS_RUSTFMT: boolean | undefined = undefined;

export async function rustfmt(
  ctx: RustContext,
  fileName: string
): Promise<void> {
  if (IS_NODE && __HAS_RUSTFMT !== false) {
    const { _rustfmt } = (__RUSTFMT ??= await import("../node/rustfmt.js"));

    try {
      await _rustfmt(fileName);
    } catch (e) {
      console.error("Failed to run rustfmt:", e);
    }
  } else if (IS_NODE && __HAS_RUSTFMT === undefined) {
    // Check for rustfmt and cache the result.

    const { _hasRustfmt } = (__RUSTFMT ??= await import("../node/rustfmt.js"));

    __HAS_RUSTFMT = await _hasRustfmt();

    if (!__HAS_RUSTFMT) {
      console.warn("`rustfmt` not found, falling back to public rustfmt API.");
      console.warn("Please install rustfmt for faster formatting.");
    }

    return rustfmt(ctx, fileName);
  } else {
    const { text } = await ctx.program.host.readFile(fileName);
    ctx.program.host.writeFile(fileName, await callRustFmtApi(text));
  }
}

// TODO: maybe use wasm rustfmt, but it's complicated:
// https://github.com/rust-lang/rustfmt/issues/5955#issuecomment-1807261898
// At a bare minimum, we want to proxy this through Microsoft infrastructure
// before we release rather than relying on the rust-lang.org API in perpetuity.
const __RUSTFMT_API = "https://play.rust-lang.org/format";

interface RustFmtArgs {
  channel: "stable" | "beta" | "nightly";
  edition: "2015" | "2018" | "2021";
  code: string;
}

interface RustFmtResponse {
  success: boolean;
  exitDetail: string;
  stdout: string;
  stderr: string;
  code: string;
}

async function callRustFmtApi(code: string): Promise<string> {
  const args: RustFmtArgs = {
    channel: "stable",
    edition: "2021",
    code,
  };

  const response = await fetch(__RUSTFMT_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });

  if (!response.ok) {
    throw new Error(`Failed to format code: ${response.statusText}`);
  }

  const json: RustFmtResponse = await response.json();

  if (!json.success) {
    throw new Error(`Failed to format code: ${json.exitDetail}`);
  }

  return json.code;
}
