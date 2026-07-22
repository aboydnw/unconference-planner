import { describe, expect, it } from "vitest";

import {
  buildCustomAnswers,
  missingRequired,
  parseFieldOptions,
} from "@/lib/proposalFields";
import type { ProposalField } from "@/lib/types";

const field = (over: Partial<ProposalField>): ProposalField => ({
  id: "f1",
  event_id: "e",
  label: "Field",
  field_type: "text",
  options: [],
  required: false,
  position: 0,
  ...over,
});

describe("parseFieldOptions", () => {
  it("splits newline-separated options, trims, drops blanks", () => {
    expect(parseFieldOptions("Beginner\n Intermediate \n\nAdvanced\n")).toEqual([
      "Beginner",
      "Intermediate",
      "Advanced",
    ]);
  });
  it("returns empty array for empty input", () => {
    expect(parseFieldOptions("")).toEqual([]);
  });
});

describe("buildCustomAnswers", () => {
  it("collects trimmed non-empty answers keyed by field id", () => {
    const fields = [field({ id: "a" }), field({ id: "b" }), field({ id: "c" })];
    const read = (id: string) => ({ a: " hi ", b: "", c: "x" })[id] ?? "";
    expect(buildCustomAnswers(fields, read)).toEqual({ a: "hi", c: "x" });
  });
});

describe("missingRequired", () => {
  it("returns labels of required fields with no answer", () => {
    const fields = [
      field({ id: "a", label: "Level", required: true }),
      field({ id: "b", label: "Handle", required: false }),
      field({ id: "c", label: "Track", required: true }),
    ];
    expect(missingRequired(fields, { c: "Data" })).toEqual(["Level"]);
  });
  it("returns empty when all required are answered", () => {
    const fields = [field({ id: "a", label: "Level", required: true })];
    expect(missingRequired(fields, { a: "Beginner" })).toEqual([]);
  });
});
