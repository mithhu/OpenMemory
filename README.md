# OpenMemory

**Your memories are more than moments. See what they mean together.**

OpenMemory is a personal memory companion powered by GPT-6 Astra. Write a natural-language note, explore its place in a constellation, and ask questions across the things you've actually lived. Every pattern, tension, and proposed next step links back to its supporting memories.

## Run locally

```sh
npm install
cp .env.example .env
# Add your hackathon key to OPEN_AI_KEY in .env.
npm run dev
```

If `.env` already exists, keep it and add the key there. The current project also accepts `OPENAI_API_KEY` or `ASTRA_API_KEY`. Restart the dev server after changing a key. Open the URL printed by Vite.

Astra calls run on the server. The key is never sent to the browser or embedded in the build. Memories are saved in browser localStorage; capturing a note, automatically updating its connections, and requesting a briefing send memories to OpenAI for that request. Responses use `store: false`.

## The demo

New browsers start with ten clearly fictional demo memories. Existing memories from the original prototype are preserved. **Explore the demo** adds the example story alongside existing memories. Preview connections are explicitly labeled while the map updates. With a configured key, Astra maps relationships automatically after memories change; results are cached between visits. **Find the hidden threads** requests a separate reflective briefing.

Mapping prioritizes shared people and events, then meaningful themes. A unique explicit role such as “Alex is my best friend” can connect to “watched a movie with my best friend”; that role resolution is an inference, shown with a dashed line and an explanation. Ambiguous identities must not be guessed. The node layout stays stable; distance and categories do not determine relationships.

The core loop:

1. **Remember:** Astra creates or merges a memory and asks one useful missing question. Ambiguous matches ask you to choose.
2. **Connect:** Astra identifies patterns, opportunities, and tensions, with a visual map and evidence links.
3. **Ask:** Ask a question across your memories. The answer includes supporting sources and practical next steps.
4. **Act and reflect:** Mark a suggested step complete. OpenMemory records that explicit status as a new memory, asks what changed, and includes it in future Astra context. Reopening the step updates the record without losing its history.

You can edit memories, answer follow-up questions, search/filter the journal, and export/import JSON backups. Text and Markdown imports go into the composer for review before an API request. Importing JSON adds new memories and preserves existing ones.

See [DEMO.md](./DEMO.md) for a short judging script.

## Architecture

- React 19, TypeScript, TanStack Start/Router, Vite, Tailwind 4.
- `src/routes/index.tsx`: workspace, journal, questions, browser persistence, and request orchestration.
- `src/components/MemoryMap.tsx`: interactive SVG constellation, with dashed inferred relationships.
- `src/hooks/use-memory-graph.ts`: automatic, debounced relationship mapping, cached independently of briefings; discards responses to outdated memory snapshots.
- `src/components/InsightPanel.tsx`: findings, sources, and next actions.
- `src/components/MemoryCard.tsx`: memory details and follow-up answers.
- `src/lib/memory.ts`: validated data types, storage, continuity, demo fixtures, and action records.
- `src/lib/astra.ts`: validated TanStack server functions.
- `src/lib/astra.server.ts`: server-only key handling, Responses API requests, grounding prompts, and source-ID checks.
- `src/server.ts` and `src/start.ts`: SSR error handling and CSRF middleware.

Structured results follow the [OpenAI Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs). The app checks source IDs and preserves original notes; the generated interpretations still need human judgment.

## Validation

```sh
npm test
npx tsc --noEmit
npm run build
```

Tests cover memory continuity, damaged browser storage, recorded answers, explicit action completion/reopening, automatic graph updates, outdated graph responses, invalid source references, forced matches, API payloads, and API failure handling.

This is a local hackathon prototype: up to 200 memories, no accounts/cloud sync, and no external calendar or reminder execution. The default Lovable build targets Cloudflare. For deployment, provide the key as a runtime server secret; the local `.env` is not packaged with the app. A shared hosted deployment needs authentication and usage limits before exposing its API routes.

## Lovable

This project remains connected to [Lovable](https://lovable.dev/projects/fbed8a85-f86a-4810-81ca-ba74e11d5ab4). Keep published Git history intact so the editor's history stays in sync.
