import { describe, expect, it } from "vitest";
import { spanCorrections } from "./support/title-spans";
import { hasOriginalTitleSpan } from "../lib/title-evidence";

describe("Experimental full title evidence contract", () => {
  it("permits omitted ordinary rows but still requires every media row", () => {
    const media = { entryIndex: 1, sourceTitle: "Spiritted Away", suggestedTitle: "Spirited Away" };
    const note = "Neravi is my friend. I want to watch Spiritted Away.";
    expect(spanCorrections({ titles: [media] }, [0, 1], note, [0])).toEqual({
      corrections: [media],
    });
    expect(() => spanCorrections({ titles: [] }, [0, 1], note, [0])).toThrow("Missing");
    expect(() =>
      spanCorrections(
        { titles: [{ entryIndex: 0, sourceTitle: null, suggestedTitle: null }] },
        [0, 1],
        note,
        [0],
      ),
    ).toThrow("Missing");
    expect(() =>
      spanCorrections(
        { titles: [media, { entryIndex: 0, sourceTitle: "Neravi", suggestedTitle: "Neravi" }] },
        [0, 1],
        note,
        [0],
      ),
    ).toThrow("Non-media");
    expect(() =>
      spanCorrections(
        {
          titles: [
            media,
            { entryIndex: 0, sourceTitle: null, suggestedTitle: null },
            { entryIndex: 0, sourceTitle: null, suggestedTitle: null },
          ],
        },
        [0, 1],
        note,
        [0],
      ),
    ).toThrow("repeated");
  });
  it("rejects a normalized title hidden inside a misspelled word", () => {
    expect(hasOriginalTitleSpan("I read The Hobbitt.", "The Hobbit")).toBe(false);
    expect(hasOriginalTitleSpan("I read xSapiens.", "Sapiens")).toBe(false);
    expect(() =>
      spanCorrections(
        { titles: [{ entryIndex: 0, sourceTitle: "The Hobbit", suggestedTitle: "The Hobbit" }] },
        [0],
        "I read The Hobbitt.",
      ),
    ).toThrow("absent");
  });
  it("accepts full title spans with punctuation, unicode, and a later complete occurrence", () => {
    for (const [note, title] of [
      ["I read Hobbitt, then Hobbit.", "Hobbit"],
      ["I read ‘Café at Dawn’.", "Café at Dawn"],
      ["I watched WALL·E.", "WALL·E"],
      ["I read Elarin:  A Quiet Shore.", "Elarin:  A Quiet Shore"],
    ]) {
      expect(hasOriginalTitleSpan(note!, title!)).toBe(true);
    }
  });
  it("allows a null row for an ordinary person alongside the correct movie correction", () => {
    expect(
      spanCorrections(
        {
          titles: [
            { entryIndex: 0, sourceTitle: null, suggestedTitle: null },
            { entryIndex: 1, sourceTitle: "Jurrasic Park", suggestedTitle: "Jurassic Park" },
          ],
        },
        [0, 1],
        "Tazmira is my friend. I want to watch Jurrasic Park.",
        [0],
      ),
    ).toEqual({
      corrections: [
        { entryIndex: 1, sourceTitle: "Jurrasic Park", suggestedTitle: "Jurassic Park" },
      ],
    });
    expect(() =>
      spanCorrections(
        {
          titles: [
            { entryIndex: 0, sourceTitle: "Tazmira", suggestedTitle: "Tamira" },
            { entryIndex: 1, sourceTitle: "Jurrasic Park", suggestedTitle: "Jurassic Park" },
          ],
        },
        [0, 1],
        "Tazmira is my friend. I want to watch Jurrasic Park.",
        [0],
      ),
    ).toThrow("Non-media");
  });
  it("preserves unfamiliar titles and proposes only model-supplied spelling changes", () => {
    expect(
      spanCorrections(
        {
          titles: [
            { entryIndex: 1, sourceTitle: "Intersteller", suggestedTitle: "Interstellar" },
            { entryIndex: 0, sourceTitle: "Zavreth", suggestedTitle: "Zavreth" },
          ],
        },
        [0, 1],
        "I watched Zavreth and want to watch Intersteller.",
      ),
    ).toEqual({
      corrections: [{ entryIndex: 1, sourceTitle: "Intersteller", suggestedTitle: "Interstellar" }],
    });
  });
  it("does not invent a source for a pronoun-only reference", () => {
    expect(
      spanCorrections(
        { titles: [{ entryIndex: 0, sourceTitle: null, suggestedTitle: null }] },
        [0],
        "I finished it.",
      ),
    ).toEqual({ corrections: [] });
  });
  it.each([
    { titles: [] },
    { titles: [{ entryIndex: 1, sourceTitle: "Sapens", suggestedTitle: "Sapiens" }] },
    {
      titles: [
        { entryIndex: 0, sourceTitle: "Sapens", suggestedTitle: "Sapiens" },
        { entryIndex: 0, sourceTitle: "Sapens", suggestedTitle: "Sapiens" },
      ],
    },
    { titles: [{ entryIndex: 0, sourceTitle: "invented", suggestedTitle: "Sapiens" }] },
    { titles: [{ entryIndex: 0, sourceTitle: null, suggestedTitle: "Sapiens" }] },
  ])("rejects missing, repeated, unrelated or fabricated source evidence %j", (raw) => {
    expect(() => spanCorrections(raw, [0], "I read Sapens.")).toThrow();
  });
});
