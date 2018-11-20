const crypto = require('crypto');

/**
 * hashes the password with server-provided salt
 * @param  {String} password   the password to the faktory server
 * @param  {String} salt       the server-provided salt to use in hashing
 * @param  {Number} iterations the number of time to apply the salt
 * @return {String}            the password hash
 * @private
 */
module.exports = function hash(password, salt, iterations) {
  let current = crypto.createHash('sha256').update(`${password}${salt}`);

  for (let i = 1; i < iterations; i += 1) {
    current = crypto.createHash('sha256').update(current.digest());
  }

  return current.digest('hex');
};
