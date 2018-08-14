module.exports = function wrapNonErrors(object) {
  if (object instanceof Error) return object;
  console.warn(`
Job failed without providing an error.
Ensure your promise was rejected with an *Error* and not a *String*

correct:\treject(new Error('message'))
incorrect:\treject('message')
  `);
  return new Error(object || 'Job failed with no error or message given');
};
