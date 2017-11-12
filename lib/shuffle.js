/**
 * https://bost.ocks.org/mike/shuffle/
 * @param  {Array} array array to shuffle
 * @return {Array}       shuffled array
 */
module.exports = function shuffle(arrayToShuffle) {
  const array = arrayToShuffle.slice();
  let counter = array.length;

  while (counter > 0) {
    const index = Math.floor(Math.random() * counter);

    counter -= 1;

    const temp = array[counter];
    array[counter] = array[index];
    array[index] = temp;
  }

  return array;
};
