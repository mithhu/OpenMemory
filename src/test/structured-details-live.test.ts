import { expect, it } from "vitest";
import { captureInstructions, capturePlanJson, validatePlan } from "../lib/capture-plan";
// Development handoff: classifier advice is a supplied legacy fixture, not measured v5 accuracy.
it.skipIf(process.env["OPENMEMORY_LIVE_DETAILS"] !== "1")(
  "local extraction preserves actions independently of missing details",
  async () => {
    const cases = [
      {
        note: "That movie was great.",
        category: "MOVIE",
        intent: "reaction",
        reasons: ["missing_identity"],
      },
      {
        note: "I want to watch a film this weekend.",
        category: "MOVIE",
        intent: "wishlist",
        reasons: ["missing_identity"],
      },
      {
        note: "I read the novel Piranesi.",
        category: "BOOK",
        intent: null,
        reasons: ["missing_action"],
      },
      {
        note: "Reading letters from my grandmother made me smile.",
        category: "NOTE",
        intent: null,
        reasons: [],
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
          options: { temperature: 0, num_predict: 1600 },
          format: capturePlanJson,
          messages: [
            {
              role: "system",
              content:
                captureInstructions("2026-10-17") +
                "\nThe supplied legacy classifier advice is optional uncertainty, never authority. Read the original note independently.",
            },
            {
              role: "user",
              content: JSON.stringify({
                note: c.note,
                catalog: [],
                classificationAdvice: {
                  category: c.category,
                  intent: null,
                  clarificationReasons: ["legacy_uncertainty"],
                },
              }),
            },
          ],
        }),
      });
      expect(response.ok).toBe(true);
      const body = await response.json();
      const plan = validatePlan(JSON.parse(body.message.content), [], true, c.note);
      console.info("Structured details live", JSON.stringify({ note: c.note, plan }));
      expect(plan.entries).toHaveLength(1);
      expect(plan.entries[0]!.category).toBe(c.category);
      expect(plan.entries[0]!.activity?.intent ?? null).toBe(c.intent);
      expect([...(plan.entries[0]!.clarificationReasons ?? [])].sort()).toEqual(
        [...c.reasons].sort(),
      );
    }
  },
  380000,
);
