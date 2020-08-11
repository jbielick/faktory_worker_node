/**
 * An RFC3339-format datetime string
 * @typedef RFC3339_DateTime
 * @type {string}
 * @external
 * @example
 * "2002-10-02T10:00:00-05:00"
 * "2002-10-02T15:00:00Z"
 * "2002-10-02T15:00:00.05Z"
 *
 * new Date().toISOString();
 * // => '2019-02-11T15:59:15.593Z'
 */
export type RFC3339_DateTime = string;

/**
 * An after-connect initial message from the server to handshake the connection
 *
 * @typedef HI
 * @type {object}
 * @external
 * @property {number} v faktory server protocol version number
 * @property {number} i only present when password is required. number of password hash iterations.
 *                      see {@link HELLO}.
 * @property {string} s only present when password is required. salt for password hashing.
 *                      see {@link HELLO}.
 * @see  external:HELLO
 */

/**
 * The client's response to the server's {@link HI} to initiate a connection
 *
 * @typedef {object} HELLO
 * @external
 * @property {string} v the faktory client protocol version
 * @property {string} hostname name of the host that is running this worker
 * @property {string} wid globally unique identifier for this worker
 * @property {number} pid local process identifier for this worker on its host
 * @property {string[]} labels labels that apply to this worker, to allow producers to target work
 *                             units to worker types.
 * @property {string} pwdhash This field should be the hexadecimal representation of the ith
 *                            SHA256 hash of the client password concatenated with the value in s.
 * @see  external:HI
 * @see  {@link https://github.com/contribsys/faktory/blob/master/docs/protocol-specification.md|Faktory Protocol Specification}
 */
