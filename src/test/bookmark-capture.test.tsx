import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BookmarkCapture } from "../components/BookmarkCapture";
import { createBookmark, type BookmarkHandoff } from "../lib/bookmarks";
const input: BookmarkHandoff = {
  version: 1,
  id: "123e4567-e89b-42d3-a456-426614174000",
  url: "https://example.com/post",
  title: "A useful thread",
  note: "Read this later",
};
afterEach(cleanup);
it("keeps the reviewed draft when persistence fails", async () => {
  const save = vi.fn(async () => false);
  render(
    <BookmarkCapture
      input={input}
      memories={[]}
      disabled={false}
      onSave={save}
      onCancel={() => {}}
      onOpen={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save link" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Your draft is still here");
  expect(screen.getByLabelText(/Why I’m saving/)).toHaveValue(input.note);
});
it("offers an existing bookmark without overwriting its note", () => {
  const open = vi.fn();
  const save = vi.fn(async () => true);
  const existing = createBookmark(input);
  render(
    <BookmarkCapture
      input={{ ...input, note: "A different note" }}
      memories={[existing]}
      disabled={false}
      onSave={save}
      onCancel={() => {}}
      onOpen={open}
    />,
  );
  expect(screen.getByRole("button", { name: "Already saved" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /Open saved link/ }));
  expect(open).toHaveBeenCalledWith(existing.id);
  expect(save).not.toHaveBeenCalled();
});
