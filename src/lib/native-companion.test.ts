import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NativeCompanionClient,
  NATIVE_COMPANION_ORIGIN,
  NATIVE_PROTOCOL_SHA256,
  NATIVE_CLASSIFIER_PROFILE,
} from "./native-companion";
const identity = { model_inventory: "a".repeat(64), adapter_inventory: "b".repeat(64) };
const capability = "c".repeat(64);
const json = (v: unknown) =>
  new Response(JSON.stringify(v), { headers: { "Content-Type": "application/json" } });
const ready = () => ({
  version: 1,
  protocol_sha256: NATIVE_PROTOCOL_SHA256,
  profiles: [
    {
      profile: NATIVE_CLASSIFIER_PROFILE,
      purpose: "classify",
      ready: true,
      artifact_identity: identity,
      capture_ready: false,
      save_authorized: false,
    },
    ...["extract", "interpret-titles"].map((purpose) => ({
      profile: "qwen-full-capture-v1",
      purpose,
      ready: false,
      artifact_identity: null,
      capture_ready: false,
      save_authorized: false,
    })),
  ],
});
async function reply(init: RequestInit) {
  const request = JSON.parse(init.body as string);
  const bytes = await webcrypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(request.input.note),
  );
  return {
    version: 1,
    request_id: request.request_id,
    purpose: "classify",
    profile: NATIVE_CLASSIFIER_PROFILE,
    source_sha256: Buffer.from(bytes).toString("hex"),
    protocol_sha256: NATIVE_PROTOCOL_SHA256,
    artifact_identity: identity,
    advice: { category: "NOTE", intent: "none" },
    capture_ready: false,
    save_authorized: false,
    reaped: true,
  };
}
function fixture(
  change: (v: Awaited<ReturnType<typeof reply>>) => unknown = (v) => v,
  cancelReaped = true,
) {
  const transport = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith("/v1/readiness")) return json(ready());
    if (init?.method === "DELETE")
      return json({
        version: 1,
        request_id: String(url).split("/").pop(),
        cleanup_pending: !cancelReaped,
        reaped: cancelReaped,
      });
    return json(change(await reply(init!)));
  });
  return {
    transport,
    client: new NativeCompanionClient(
      { capability, artifactIdentity: identity },
      transport as typeof fetch,
    ),
  };
}
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("dormant native companion", () => {
  it("preserves exact source and fixed purpose/profile, with no credential forwarding", async () => {
    const { client, transport } = fixture();
    const note = "  A fictional thought\nwith a typo.  ";
    expect(await client.classify(note)).toEqual({ category: "NOTE", intent: "none" });
    expect(client.cleanupPending).toBe(false);
    const [url, options] = transport.mock.calls[1]!;
    expect(url).toBe(NATIVE_COMPANION_ORIGIN + "/v1/requests");
    expect(JSON.parse(options!.body as string)).toMatchObject({
      version: 1,
      purpose: "classify",
      profile: NATIVE_CLASSIFIER_PROFILE,
      input: { note },
    });
    expect(options).toMatchObject({
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    expect(options!.headers).toEqual({
      "X-OpenMemory-Capability": capability,
      "Content-Type": "application/json",
    });
  });
  it("refuses extraction/title and cleared/unqualified pairing without network", async () => {
    const { client, transport } = fixture();
    expect(() => client.extract()).toThrow();
    expect(() => client.interpretTitles()).toThrow();
    client.clearPairing();
    await expect(client.classify("fictional")).rejects.toMatchObject({ code: "not-ready" });
    expect(transport).not.toHaveBeenCalled();
    expect(
      () => new NativeCompanionClient({ capability: "short", artifactIdentity: identity }),
    ).toThrow();
  });
  it.each(["request_id", "source_sha256", "protocol_sha256", "artifact_identity"])(
    "rejects changed %s association",
    async (field) => {
      const { client } = fixture((v) => ({
        ...v,
        [field]:
          field === "artifact_identity"
            ? { ...identity, adapter_inventory: "d".repeat(64) }
            : "d".repeat(64),
      }));
      await expect(client.classify("fictional")).rejects.toMatchObject({
        code: "invalid-response",
      });
    },
  );
  it("rejects mixed mismatch, extra authority and incomplete success", async () => {
    for (const change of [
      (v: Awaited<ReturnType<typeof reply>>) => ({
        ...v,
        advice: { category: "MIXED", intent: "clarify" },
      }),
      (v: Awaited<ReturnType<typeof reply>>) => ({ ...v, save_authorized: true }),
      (v: Awaited<ReturnType<typeof reply>>) => ({ ...v, reaped: false }),
      (v: Awaited<ReturnType<typeof reply>>) => ({ ...v, model_path: "/fake" }),
    ]) {
      await expect(fixture(change).client.classify("fictional")).rejects.toMatchObject({
        code: "invalid-response",
      });
    }
  });
  it("rejects duplicate and escaped duplicate keys rather than accepting last value", async () => {
    for (const repeated of [
      '"category":"BOOK","category":"NOTE"',
      '"category":"BOOK","\\u0063ategory":"NOTE"',
    ]) {
      const { client, transport } = fixture();
      transport.mockImplementationOnce(async () => json(ready()));
      transport.mockImplementationOnce(
        async (_url, init) =>
          new Response(JSON.stringify(await reply(init!)).replace('"category":"NOTE"', repeated), {
            headers: { "Content-Type": "application/json" },
          }),
      );
      await expect(client.classify("fictional")).rejects.toMatchObject({
        code: "invalid-response",
      });
    }
  });
  it("refuses stale readiness or capture readiness before POST", async () => {
    for (const mutate of [
      (v: ReturnType<typeof ready>) => {
        v.profiles[0]!.artifact_identity = { ...identity, model_inventory: "d".repeat(64) };
      },
      (v: ReturnType<typeof ready>) => {
        v.profiles[1]!.ready = true;
      },
    ]) {
      const { client, transport } = fixture();
      const value = ready();
      mutate(value);
      transport.mockImplementationOnce(async () => json(value));
      await expect(client.classify("fictional")).rejects.toMatchObject({ code: "not-ready" });
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });
  it("bounds response bytes and refuses non-JSON or redirect success", async () => {
    for (const response of [
      new Response(" ".repeat(65537), { headers: { "Content-Type": "application/json" } }),
      new Response("{}", { headers: { "Content-Type": "text/plain" } }),
    ]) {
      const { client, transport } = fixture();
      transport.mockImplementationOnce(async () => response);
      await expect(client.classify("fictional")).rejects.toThrow();
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });
  it("pre-abort and oversize input make no transport call", async () => {
    const { client, transport } = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(client.classify("fictional", { signal: controller.signal })).rejects.toMatchObject(
      { code: "cancelled", cleanupPending: false },
    );
    await expect(client.classify("x".repeat(16385))).rejects.toMatchObject({ code: "unsupported" });
    expect(transport).not.toHaveBeenCalled();
  });
  it("fetch abort never implies reap; busy persists until explicit matching cleanup", async () => {
    const { client, transport } = fixture((v) => v, false);
    const controller = new AbortController();
    let posted!: () => void;
    const started = new Promise<void>((resolve) => {
      posted = resolve;
    });
    transport.mockImplementationOnce(async () => json(ready()));
    transport.mockImplementationOnce(async () => {
      posted();
      return new Promise<Response>(() => {});
    });
    const pending = client.classify("fictional", { signal: controller.signal });
    await started;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "cancelled", cleanupPending: true });
    await expect(client.classify("second")).rejects.toMatchObject({ code: "busy" });
    expect(() => client.clearPairing()).toThrow();
    transport.mockImplementationOnce(async (url) =>
      json({
        version: 1,
        request_id: String(url).split("/").pop(),
        cleanup_pending: false,
        reaped: true,
      }),
    );
    expect(await client.cancelPending()).toBe(true);
    expect(client.cleanupPending).toBe(false);
  });
  it("acknowledged cancellation aborts old request and cannot publish its late success", async () => {
    const { client, transport } = fixture();
    let resolve!: (response: Response) => void;
    let init!: RequestInit;
    let posted!: () => void;
    const started = new Promise<void>((r) => {
      posted = r;
    });
    transport.mockImplementationOnce(async () => json(ready()));
    transport.mockImplementationOnce(async (_url, options) => {
      init = options!;
      posted();
      return new Promise<Response>((r) => {
        resolve = r;
      });
    });
    const pending = client.classify("old fictional");
    const checked = expect(pending).rejects.toMatchObject({ code: "cancelled" });
    await started;
    expect(await client.cancelPending()).toBe(true);
    await checked;
    resolve(json(await reply(init)));
    await Promise.resolve();
    expect(client.cleanupPending).toBe(false);
    expect(await client.classify("new fictional")).toEqual({ category: "NOTE", intent: "none" });
  });
  it("cancel intent blocks late POST advice while DELETE cleanup is pending", async () => {
    const { client, transport } = fixture();
    let postInit!: RequestInit;
    let postResolve!: (response: Response) => void;
    let deleteResolve!: (response: Response) => void;
    let posted!: () => void;
    let deleting!: () => void;
    const started = new Promise<void>((r) => {
      posted = r;
    });
    const cancellationStarted = new Promise<void>((r) => {
      deleting = r;
    });
    transport.mockImplementationOnce(async () => json(ready()));
    transport.mockImplementationOnce(async (_url, init) => {
      postInit = init!;
      posted();
      return new Promise<Response>((r) => {
        postResolve = r;
      });
    });
    transport.mockImplementationOnce(async () => {
      deleting();
      return new Promise<Response>((r) => {
        deleteResolve = r;
      });
    });
    let published = false;
    const pending = client.classify("fictional delayed cancellation").then((v) => {
      published = true;
      return v;
    });
    const checked = expect(pending).rejects.toMatchObject({ code: "cancelled" });
    await started;
    const cancelled = client.cancelPending();
    await cancellationStarted;
    expect(postInit.signal!.aborted).toBe(true);
    postResolve(json(await reply(postInit)));
    await Promise.resolve();
    await Promise.resolve();
    expect(published).toBe(false);
    expect(client.cleanupPending).toBe(true);
    await expect(client.classify("another")).rejects.toMatchObject({ code: "busy" });
    const id = JSON.parse(postInit.body as string).request_id;
    deleteResolve(json({ version: 1, request_id: id, cleanup_pending: false, reaped: true }));
    expect(await cancelled).toBe(true);
    await checked;
    expect(published).toBe(false);
    expect(client.cleanupPending).toBe(false);
    expect(transport.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(1);
  });
  it("cancel during readiness never submits an eventual POST", async () => {
    const { client, transport } = fixture();
    let readyResolve!: (response: Response) => void;
    let requested!: () => void;
    const readinessStarted = new Promise<void>((r) => {
      requested = r;
    });
    transport.mockImplementationOnce(async () => {
      requested();
      return new Promise<Response>((r) => {
        readyResolve = r;
      });
    });
    transport.mockImplementationOnce(async () =>
      json({ version: 1, error: { code: "not_found" } }),
    );
    const pending = client.classify("fictional readiness cancellation");
    const checked = expect(pending).rejects.toMatchObject({ code: "cancelled" });
    await readinessStarted;
    await client.cancelPending();
    await checked;
    readyResolve(json(ready()));
    await Promise.resolve();
    await Promise.resolve();
    expect(transport.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    expect(client.cleanupPending).toBe(false);
  });
  it("wrong cancellation identity cannot release owner", async () => {
    const { client, transport } = fixture((v) => ({ ...v, reaped: false }));
    transport.mockImplementationOnce(async () => json(ready()));
    transport.mockImplementationOnce(async (_url, init) =>
      json({ ...(await reply(init!)), reaped: false }),
    );
    transport.mockImplementationOnce(async () =>
      json({ version: 1, request_id: "wrong", cleanup_pending: false, reaped: true }),
    );
    await expect(client.classify("fictional")).rejects.toMatchObject({ cleanupPending: true });
    expect(client.cleanupPending).toBe(true);
  });
  it("post deadline and failed cancellation remain busy, with no second request", async () => {
    vi.useFakeTimers();
    const { client, transport } = fixture();
    let posted!: () => void;
    const started = new Promise<void>((r) => {
      posted = r;
    });
    transport.mockImplementationOnce(async () => json(ready()));
    transport.mockImplementationOnce(async () => {
      posted();
      return new Promise<Response>(() => {});
    });
    transport.mockImplementationOnce(async () => new Promise<Response>(() => {}));
    const pending = client.classify("fictional");
    const checked = expect(pending).rejects.toMatchObject({
      code: "deadline",
      cleanupPending: true,
    });
    await started;
    await vi.advanceTimersByTimeAsync(95000);
    await checked;
    expect(client.cleanupPending).toBe(true);
    await expect(client.classify("second")).rejects.toMatchObject({ code: "busy" });
    expect(transport).toHaveBeenCalledTimes(3);
    expect(transport.mock.calls[2]![1]!.method).toBe("DELETE");
  });
  it("deadline stops even a transport that ignores signal, no fallback or retry", async () => {
    vi.useFakeTimers();
    const { client, transport } = fixture();
    transport.mockImplementation(async () => new Promise<Response>(() => {}));
    const pending = client.classify("fictional");
    const checked = expect(pending).rejects.toMatchObject({
      code: "deadline",
      cleanupPending: false,
    });
    await vi.advanceTimersByTimeAsync(10000);
    await checked;
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
