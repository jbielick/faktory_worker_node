import { createHash } from "crypto";
import { Job, JobPayload, PartialJobPayload } from "./job";

export function encode(
  object: Record<string, unknown> | Array<Record<string, unknown>>
): string {
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
 * internal function to generate a hashed string. the exported version below wraps it in a cache.
 */
function generateHash(
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

/**
 * hashes the password with server-provided salt
 * @param  {String}  password            the password to the faktory server
 * @param  {String}  salt                the server-provided salt to use in hashing
 * @param  {Number}  iterations          the number of time to apply the salt
 * @param            options             internal options for execution
 * @param  {Boolean} options.ignoreCache specify as true to always calculate the hash, even if a cached result exists.
 * @return {String}                      the password hash
 * @private
 */
export const hash = (function () {
  const hashCache: Record<string, Record<string, Record<number, string>>> = {};

  return function hash(
    password: string,
    salt: string,
    iterations: number,
    { ignoreCache }: { ignoreCache: boolean } = { ignoreCache: true }
  ): string {
    const cachedHash = hashCache[password]?.[salt]?.[iterations];
    if (cachedHash !== undefined && !ignoreCache) {
      return cachedHash;
    }

    const hexHash = generateHash(password, salt, iterations);

    // add the hex result to our cache
    hashCache[password] = {
      ...(hashCache[password] || {}),
      [salt]: {
        ...(hashCache[password]?.[salt] || {}),
        [iterations]: hexHash,
      },
    };

    return hexHash;
  };
})();

export function toJobPayloadWithDefaults(
  job: Job | PartialJobPayload
): JobPayload {
  const payload = "toJSON" in job ? (job as Job).toJSON() : job;
  return Object.assign({ jid: Job.jid() }, Job.defaults, payload);
}
