
module.exports = function sleep(ms, value = true) {
  return new Promise(resolve => (
    setTimeout(() => resolve(value), ms)
  ));
};
