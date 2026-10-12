import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";

export const titleQuerySchema = z
  .object({
    kind: z.enum(["book", "movie"]),
    title: z.string().trim().min(1).max(300),
  })
  .strict();
export type TitleQuery = z.infer<typeof titleQuerySchema>;
export type CatalogTitle = {
  id: string;
  title: string;
  detail: string;
  url: string;
  source: "Open Library" | "Wikidata";
};
export const searchTitleCatalog = createServerFn({ method: "POST" })
  .validator((input: unknown) => titleQuerySchema.parse(input))
  .handler(async ({ data }) => {
    const { searchCatalog } = await import("./title-catalog.server");
    return searchCatalog(data);
  });
