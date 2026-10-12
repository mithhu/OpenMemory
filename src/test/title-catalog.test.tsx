import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TitleCatalog } from "../components/TitleCatalog";
import { CaptureReview } from "../components/CaptureReview";
import { applyCapturePlan, type CaptureEntry } from "../lib/capture-plan";
import { titleQuerySchema, type CatalogTitle } from "../lib/title-catalog";
import { searchCatalog } from "../lib/title-catalog.server";

const lookup = vi.hoisted(() => vi.fn());
vi.mock("../lib/title-catalog", async (original) => ({
  ...(await original<object>()),
  searchTitleCatalog: lookup,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const candidate: CatalogTitle = {
  id: "/works/OL1W",
  title: "Sapiens",
  detail: "Author · 2011",
  url: "https://openlibrary.org/works/OL1W",
  source: "Open Library",
};

describe("Explicit catalog lookup privacy and source validation", () => {
  it("rejects an extra private note, unsupported kind or oversized query", () => {
    expect(() =>
      titleQuerySchema.parse({ kind: "book", title: "Sapiens", note: "private" }),
    ).toThrow();
    expect(() => titleQuerySchema.parse({ kind: "person", title: "someone" })).toThrow();
    expect(() => titleQuerySchema.parse({ kind: "movie", title: "x".repeat(301) })).toThrow();
  });
  it("sends only the title to Open Library, derives safe work links, and excludes invented keys", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          docs: [
            {
              key: "/works/OL1W",
              title: "Sapiens",
              author_name: ["Author"],
              first_publish_year: 2011,
            },
            { key: "https://evil.example/", title: "Fake" },
          ],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await searchCatalog({ kind: "book", title: "Sapiens & friends" });
    const url = fetch.mock.calls[0]![0] as URL;
    expect(url.origin).toBe("https://openlibrary.org");
    expect(url.searchParams.get("title")).toBe("Sapiens & friends");
    expect(result).toEqual([candidate]);
  });
  it("requires Wikidata film claims rather than trusting descriptions", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            query: { search: [{ title: "Q1" }, { title: "Q2" }, { title: "bad/url" }] },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            entities: {
              Q1: {
                labels: { en: { value: "Moon" } },
                descriptions: { en: { value: "2009 film" } },
                claims: { P31: [{ mainsnak: { datavalue: { value: { id: "Q11424" } } } }] },
              },
              Q2: {
                labels: { en: { value: "Moon" } },
                descriptions: { en: { value: "a film according to a misleading description" } },
                claims: { P31: [{ mainsnak: { datavalue: { value: { id: "Q5" } } } }] },
              },
            },
          }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    expect(await searchCatalog({ kind: "movie", title: "Moon" })).toEqual([
      {
        id: "Q1",
        title: "Moon",
        detail: "2009 film",
        source: "Wikidata",
        url: "https://www.wikidata.org/wiki/Q1",
      },
    ]);
    expect((fetch.mock.calls[1]![0] as URL).searchParams.get("ids")).toBe("Q1|Q2");
  });
  it("reports provider failures without returning guessed titles", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 429 })));
    await expect(searchCatalog({ kind: "book", title: "Sapiens" })).rejects.toThrow("unavailable");
  });
  it("never searches automatically and requires an explicit candidate choice", async () => {
    lookup.mockResolvedValue([candidate]);
    const choose = vi.fn();
    render(<TitleCatalog kind="book" title="Sapens" onChoose={choose} />);
    expect(lookup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Check a real book title online"));
    fireEvent.click(screen.getByRole("button", { name: "Search online" }));
    await screen.findByText("Author · 2011");
    expect(lookup).toHaveBeenCalledWith({ data: { kind: "book", title: "Sapens" } });
    expect(choose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Use this title" }));
    expect(choose).toHaveBeenCalledWith(candidate);
  });
  it("ignores an old search response after the user changes the title", async () => {
    let resolve!: (items: CatalogTitle[]) => void;
    lookup.mockReturnValue(
      new Promise<CatalogTitle[]>((done) => {
        resolve = done;
      }),
    );
    render(<TitleCatalog kind="book" title="Sapens" onChoose={() => {}} />);
    fireEvent.click(screen.getByText("Check a real book title online"));
    fireEvent.click(screen.getByRole("button", { name: "Search online" }));
    fireEvent.change(screen.getByLabelText("Search title"), { target: { value: "Another book" } });
    resolve([candidate]);
    await waitFor(() => expect(screen.queryByText("Author · 2011")).toBeNull());
  });
  it("shows retry guidance while leaving the query intact", async () => {
    lookup.mockRejectedValue(new Error("Catalog unavailable"));
    render(<TitleCatalog kind="book" title="Sapens" onChoose={() => {}} />);
    fireEvent.click(screen.getByText("Check a real book title online"));
    fireEvent.click(screen.getByRole("button", { name: "Search online" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Catalog unavailable");
    expect(screen.getByLabelText("Search title")).toHaveValue("Sapens");
  });
  it("Enter searches inside review without submitting the memory", async () => {
    lookup.mockResolvedValue([candidate]);
    const submit = vi.fn();
    render(
      <form onSubmit={submit}>
        <TitleCatalog kind="book" title="Sapiens" onChoose={() => {}} />
      </form>,
    );
    fireEvent.click(screen.getByText("Check a real book title online"));
    fireEvent.keyDown(screen.getByLabelText("Search title"), { key: "Enter" });
    await screen.findByText("Author · 2011");
    expect(lookup).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
  });
  it("catalog selection preserves activity amounts, intent and original transcript", async () => {
    lookup.mockResolvedValue([candidate]);
    const save = vi.fn().mockResolvedValue(true);
    const entry: CaptureEntry = {
      title: "Sapens",
      summary: "Read 17 more pages of Sapens",
      category: "BOOK",
      date: "2026-10-09",
      matchedMemoryId: null,
      candidateMemoryIds: [],
      clarificationQuestion: null,
      tags: [],
      activity: {
        kind: "book",
        intent: "progress",
        progress: 17,
        progressMode: "increment",
        total: null,
        lessonNumbers: [],
        sentiment: null,
        creator: null,
      },
    };
    const original = "I red 17 more pgaes of Sapens";
    render(
      <CaptureReview
        plan={{ entries: [entry] }}
        text={original}
        memories={[]}
        onSave={save}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Check a real book title online"));
    fireEvent.click(screen.getByRole("button", { name: "Search online" }));
    await screen.findByText("Author · 2011");
    fireEvent.click(screen.getByRole("button", { name: "Use this title" }));
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const result = applyCapturePlan([], save.mock.calls[0]![0], original)[0]!;
    expect(result.title).toBe("Sapiens");
    expect(result.activity!.progress).toBe(17);
    expect(result.transcripts).toEqual([original]);
  });
  it("manual media type changes require choosing an intent instead of defaulting to completion", async () => {
    const save = vi.fn().mockResolvedValue(true);
    const entry: CaptureEntry = {
      title: "My book",
      summary: "Fictional note",
      category: "NOTE",
      date: "2026-10-09",
      matchedMemoryId: null,
      candidateMemoryIds: [],
      clarificationQuestion: null,
      tags: [],
      activity: null,
    };
    render(
      <CaptureReview
        plan={{ entries: [entry] }}
        text="Fictional note"
        memories={[]}
        onSave={save}
        onCancel={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Entry 1 type"), { target: { value: "book" } });
    expect(screen.getByLabelText("This was")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Save 1 entry" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("This was"), { target: { value: "wishlist" } });
    fireEvent.click(screen.getByRole("button", { name: "Save 1 entry" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0]![0].entries[0].activity.intent).toBe("wishlist");
    const pending = {
      ...save.mock.calls[0]![0],
      entries: [{ ...save.mock.calls[0]![0].entries[0], intentReviewRequired: true }],
    };
    expect(() => applyCapturePlan([], pending, "Fictional note")).toThrow("Choose whether");
  });
});
