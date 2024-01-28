/// <reference types="node" />

import { spawn } from "child_process";

export async function _rustfmt(fileName: string): Promise<void> {
  return new Promise(function (resolve, reject) {
    const process = spawn("rustfmt", [
      "--unstable-features",
      "--skip-children",
      "-q",
      "--edition",
      "2021",
      fileName,
    ]);

    process.on("error", reject);

    process.on("exit", function (code) {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`rustfmt exited with code ${code}`));
      }
    });
  });
}

export async function _hasRustfmt(): Promise<boolean> {
  return new Promise(function (resolve, reject) {
    const process = spawn("rustfmt", ["--version"]);

    process.on("error", reject);

    process.on("exit", function (code) {
      if (code === 0) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}
