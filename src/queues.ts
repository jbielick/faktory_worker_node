export function strictlyOrdered(queues: string[]): () => string[] {
  return () => {
    return queues;
  };
}

export function weightedRandom(queuesAndWeights: {
  [string: string]: number;
}): () => string[] {
  const raffleDrum: string[] = Object.entries(queuesAndWeights).flatMap(
    ([queue, weight]) => new Array(weight).fill(queue)
  );
  return () => {
    return Array.from(new Set(shuffle(raffleDrum)));
  };
}

// https://stackoverflow.com/a/2450976/3543371
function shuffle(input: string[]) {
  if (input.length === 0) return input;

  const shuffled: string[] = Array.from(input);
  let currentIndex = shuffled.length;
  let randomIndex;

  while (currentIndex != 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    [shuffled[currentIndex], shuffled[randomIndex]] = [
      shuffled[randomIndex],
      shuffled[currentIndex],
    ];
  }

  return shuffled;
}
