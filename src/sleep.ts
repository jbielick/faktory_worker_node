export default function sleep(ms: number, value = true) {
  return new Promise(resolve => (
    setTimeout(() => resolve(value), ms)
  ));
};
