import { titleQuerySchema, type CatalogTitle, type TitleQuery } from "./title-catalog";

async function get(url: URL): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    redirect: "error",
    headers: {
      Accept: "application/json",
      "User-Agent": "OpenMemory/0.1 (interactive title lookup)",
    },
  });
  if (!response.ok)
    throw new Error("The title catalog is unavailable. Try again later or keep your spelling.");
  const body: unknown = await response.json();
  if (body && typeof body === "object" && "error" in body)
    throw new Error("The title catalog is unavailable. Try again later or keep your spelling.");
  return body;
}
type Entity = {
  labels?: { en?: { value?: string } };
  descriptions?: { en?: { value?: string } };
  claims?: { P31?: { mainsnak?: { datavalue?: { value?: { id?: string } } } }[] };
};

export async function searchCatalog(input: TitleQuery): Promise<CatalogTitle[]> {
  const { kind, title } = titleQuerySchema.parse(input);
  try {
    if (kind === "book") {
      const url = new URL("https://openlibrary.org/search.json");
      url.search = new URLSearchParams({
        title,
        fields: "key,title,author_name,first_publish_year",
        limit: "6",
      }).toString();
      const body = (await get(url)) as {
        docs?: {
          key?: string;
          title?: string;
          author_name?: string[];
          first_publish_year?: number;
        }[];
      };
      return (body.docs ?? [])
        .filter(
          (row) =>
            /^\/works\/OL\d+W$/.test(row.key ?? "") &&
            typeof row.title === "string" &&
            row.title.trim(),
        )
        .slice(0, 6)
        .map((row) => ({
          id: row.key!,
          title: row.title!.slice(0, 300),
          detail: [
            ...(row.author_name ?? []).filter((a) => typeof a === "string").slice(0, 2),
            row.first_publish_year,
          ]
            .filter(Boolean)
            .join(" · ")
            .slice(0, 500),
          url: `https://openlibrary.org${row.key}`,
          source: "Open Library" as const,
        }));
    }
    const url = new URL("https://www.wikidata.org/w/api.php");
    url.search = new URLSearchParams({
      action: "query",
      format: "json",
      list: "search",
      srsearch: `inlabel:${JSON.stringify(title)} haswbstatement:P31=Q11424`,
      srnamespace: "0",
      srlimit: "10",
    }).toString();
    const body = (await get(url)) as { query?: { search?: { title?: string }[] } };
    const ids = [
      ...new Set(
        (body.query?.search ?? [])
          .map((row) => row.title)
          .filter((id): id is string => /^Q\d+$/.test(id ?? "")),
      ),
    ];
    if (!ids.length) return [];
    url.search = new URLSearchParams({
      action: "wbgetentities",
      format: "json",
      languages: "en",
      props: "claims|labels|descriptions",
      ids: ids.join("|"),
    }).toString();
    const details = (await get(url)) as { entities?: Record<string, Entity> };
    return ids
      .flatMap((id): CatalogTitle[] => {
        const entity = details.entities?.[id];
        // Verify the type from claims, never a search description or model guess.
        const film = entity?.claims?.P31?.some(
          (claim) => claim.mainsnak?.datavalue?.value?.id === "Q11424",
        );
        const label = entity?.labels?.en?.value;
        if (!film || !label) return [];
        return [
          {
            id,
            title: label.slice(0, 300),
            detail: (entity?.descriptions?.en?.value ?? "Film").slice(0, 500),
            url: `https://www.wikidata.org/wiki/${id}`,
            source: "Wikidata",
          },
        ];
      })
      .sort(
        (a, b) =>
          Number(b.title.toLocaleLowerCase() === title.toLocaleLowerCase()) -
          Number(a.title.toLocaleLowerCase() === title.toLocaleLowerCase()),
      )
      .slice(0, 6);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("The title catalog")) throw error;
    throw new Error(
      "Couldn't reach the title catalog. Your note is unchanged; retry or keep your spelling.",
    );
  }
}
