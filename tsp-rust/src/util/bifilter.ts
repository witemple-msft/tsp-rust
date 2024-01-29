export function bifilter<T>(
  values: Iterable<T>,
  predicate: (o: T) => boolean
): [T[], T[]] {
  const pass: T[] = [];
  const fail: T[] = [];

  for (const value of values) {
    if (predicate(value)) {
      pass.push(value);
    } else {
      fail.push(value);
    }
  }

  return [pass, fail];
}
