export function utf8Length(str: string): number {
  // Uses the string encoder API for portability
  const encoder = new TextEncoder();
  return encoder.encode(str).length;
}
