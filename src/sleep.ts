export default function sleep(ms: number, value?: unknown): Promise<unknown> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}
