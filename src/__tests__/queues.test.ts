import test from "ava";
import { strictlyOrdered, weightedRandom } from "../queues";

test("strictlyOrdered: always returns queues in order", (t) => {
  const qfn = strictlyOrdered(["one", "two", "three"]);
  t.deepEqual(qfn(), ["one", "two", "three"]);
  for (let iterations = 0; iterations < 10; iterations++) {
    t.deepEqual(qfn(), ["one", "two", "three"]);
  }
});

test("weightedRandom: always returns all queues", (t) => {
  const qfn = weightedRandom({
    one: 1,
    ten: 10,
    twenty: 20,
  });
  t.deepEqual(qfn().sort(), ["one", "ten", "twenty"].sort());
  for (let iterations = 0; iterations < 10; iterations++) {
    t.deepEqual(qfn().sort(), ["one", "ten", "twenty"].sort());
  }
});
