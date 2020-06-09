import test from "ava";

import { createHash } from "crypto";
import { hash } from "../utils";

test("hash: builds a hex pwdhash with salt", (t) => {
  const iterations = 10;
  const password = "password1";
  const salt = "dozens";

  const result = hash(password, salt, iterations);

  let current = createHash("sha256").update(password + salt);
  for (let i = 1; i < iterations; i++) {
    current = createHash("sha256").update(current.digest());
  }
  t.is(result, current.digest("hex"), "pwdhash not generated correctly");
});
