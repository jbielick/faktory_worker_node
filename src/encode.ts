export default function encode(object: Record<string, unknown>): string {
  return JSON.stringify(object);
}
