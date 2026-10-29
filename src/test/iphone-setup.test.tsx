import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Route } from "../routes/iphone";
afterEach(cleanup);
it("provides the signed Shortcut and makes the phone storage/sync boundary explicit", () => {
  const Page = Route.options.component!;
  render(<Page />);
  expect(screen.getByRole("link", { name: "Get the iPhone Shortcut" })).toHaveAttribute(
    "href",
    "https://www.icloud.com/shortcuts/fe2c9cdd42fa4e4297129677e8278139",
  );
  expect(screen.getByRole("link", { name: "Download the signed Shortcut" })).toHaveAttribute(
    "href",
    "/shortcuts/Save-to-OpenMemory.shortcut",
  );
  expect(screen.getByText(/Phone-to-Mac QR sync is not available yet/)).toBeInTheDocument();
  expect(screen.getByText(/Internet access is needed/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Back to OpenMemory/ })).toHaveAttribute("href", "/");
});
