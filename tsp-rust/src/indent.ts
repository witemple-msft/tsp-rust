export function* indent(
  values: Iterable<string>,
  indentation: string = "  "
): Iterable<string> {
  for (const value of values) {
    yield indentation + value;
  }
}
