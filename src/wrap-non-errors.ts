/**
 * wraps things that are not errors in an error object
 * @param  {*} object likely a string that was thrown instead of an error
 * @return {Error}        an error with a warning about throwing non-errors
 * @private
 */
export default function wrapNonErrors(object: string | Error | undefined): Error {
  if (object instanceof Error) return object;
  console.warn(`
Job failed without providing an error.
Ensure your promise was rejected with an *Error* and not a *String*

correct:\treject(new Error('message'))
incorrect:\treject('message')
  `);
  return new Error(object || 'Job failed with no error or message given');
};
