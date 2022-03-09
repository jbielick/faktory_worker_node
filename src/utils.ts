import { createHash } from "crypto";

export function encode(object: Record<string, unknown>): string {
  return JSON.stringify(object);
}

export function encodeArray(object: Array<Record<string, unknown>>): string {
  return JSON.stringify(object);
}

export function sleep(ms: number, value?: unknown): Promise<unknown> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/**
 * wraps things that are not errors in an error object
 * @param  {*} object likely a string that was thrown instead of an error
 * @return {Error}        an error with a warning about throwing non-errors
 * @private
 */
export function wrapNonErrors(object: string | Error | undefined): Error {
  if (object instanceof Error) return object;
  console.warn(`
Job failed without providing an error.
Ensure your promise was rejected with an *Error* and not a *String*

correct:\treject(new Error('message'))
incorrect:\treject('message')
  `);
  return new Error(object || "Job failed with no error or message given");
}

/**
 * hashes the password with server-provided salt
 * @param  {String} password   the password to the faktory server
 * @param  {String} salt       the server-provided salt to use in hashing
 * @param  {Number} iterations the number of time to apply the salt
 * @return {String}            the password hash
 * @private
 */
export function hash(
  password: string,
  salt: string,
  iterations: number
): string {
  let hash = createHash("sha256").update(`${password}${salt}`);

  for (let i = 1; i < iterations; i += 1) {
    hash = createHash("sha256").update(hash.digest());
  }

  return hash.digest("hex");
}
