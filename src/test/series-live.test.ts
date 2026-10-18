import { expect, it } from "vitest";
import { captureInstructions, capturePlanJson, validatePlan } from "../lib/capture-plan";
// Explicit opt-in only: talks to localhost, never a cloud fallback or user's vault.
it.skipIf(process.env["OPENMEMORY_LIVE_SERIES"] !== "1")(
  "extracts TV series with the installed local Qwen model",
  async () => {
    const cases = [
      {
        note: "I watched six episodes of Ted Lasso Season 4",
        intent: "progress",
        season: 4,
        episode: null,
        seasonCompleted: false,
        progress: 6,
      },
      {
        note: "I'm planning to watch Breaking Bad because my friends have recommended the series for years.",
        intent: "wishlist",
        season: null,
        episode: null,
        seasonCompleted: false,
      },
      {
        note: "I finished season 2 of Breaking Bad, but have not finished the series.",
        intent: "progress",
        season: 2,
        episode: null,
        seasonCompleted: true,
      },
      {
        note: "I watched season 1 episode 4 of Severance today.",
        intent: "progress",
        season: 1,
        episode: 4,
        seasonCompleted: false,
      },
      {
        note: "The TV series Dark is brilliant. I'm only sharing my opinion, not recording any watching today.",
        intent: "reaction",
        season: null,
        episode: null,
        seasonCompleted: false,
      },
    ];
    for (const c of cases) {
      const response = await fetch("http://127.0.0.1:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(90000),
        body: JSON.stringify({
          model: "qwen3.5:9b",
          stream: false,
          think: false,
          keep_alive: "5m",
          options: { temperature: 0, num_ctx: 16384, num_predict: 6000 },
          format: capturePlanJson,
          messages: [
            { role: "system", content: captureInstructions("2026-10-17") },
            {
              role: "user",
              content: JSON.stringify({
                note: c.note,
                catalog: [],
                ...(c.note.includes("six episodes")
                  ? {
                      classificationAdvice: {
                        category: "MOVIE",
                        intent: "progress",
                        clarificationReasons: [],
                      },
                    }
                  : {}),
              }),
            },
          ],
        }),
      });
      expect(response.ok).toBe(true);
      const body = await response.json();
      const plan = validatePlan(JSON.parse(body.message.content), [], true, c.note);
      console.info("TV series live extraction", JSON.stringify({ note: c.note, plan }));
      expect(plan.entries).toHaveLength(1);
      expect(plan.entries[0]).toMatchObject({
        category: "SERIES",
        activity: {
          kind: "series",
          intent: c.intent,
          season: c.season,
          episode: c.episode,
          seasonCompleted: c.seasonCompleted,
          progress: "progress" in c ? c.progress : null,
          total: null,
        },
      });
      if ("progress" in c) expect(plan.entries[0]!.activity?.progressMode).toBe("increment");
    }
  },
  470000,
);
