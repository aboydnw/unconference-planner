import { describe, expect, it } from "vitest";

import { createRng } from "@/lib/optimizer/random";

describe("createRng", () => {
  it("is deterministic for a given seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });
  it("differs across seeds", () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });
  it("int stays in range", () => {
    const rng = createRng(7);
    for (let i = 0; i < 100; i++) {
      const n = rng.int(5);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(5);
    }
  });
  it("pick returns an element", () => {
    const rng = createRng(7);
    expect(["a", "b", "c"]).toContain(rng.pick(["a", "b", "c"]));
  });
});
