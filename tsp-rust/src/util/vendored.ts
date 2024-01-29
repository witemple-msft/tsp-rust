let HOST_PATH: string = "::tsp_rust";

const VENDORED = "vendored";

export function setHostPath(name: string): void {
  HOST_PATH = name;
}

export function referenceHostPath(...segments: string[]): string {
  if (segments.length === 0) {
    return HOST_PATH;
  } else return HOST_PATH + "::" + segments.join("::");
}

export function referenceVendoredHostPath(...segments: string[]): string {
  return referenceHostPath(VENDORED, ...segments);
}
