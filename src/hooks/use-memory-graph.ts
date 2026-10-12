import { useEffect, useRef, useState } from "react";
import { mapWithProvider, defaultAISettings, type AISettings } from "@/lib/ai-client";
import {
  fingerprint,
  loadGraph,
  saveGraph,
  today,
  type Memory,
  type SavedGraph,
} from "@/lib/memory";

// Map updates are separate from reflective briefings. One request at a time;
// Changes cancel stale requests; capture and review take priority over mapping.
export function useMemoryGraph(
  memories: Memory[],
  options: { loaded: boolean; enabled: boolean; paused: boolean; settings?: AISettings },
) {
  const [graph, setGraph] = useState<SavedGraph | null>(null);
  const [ready, setReady] = useState(false);
  const [mapping, setMapping] = useState(false);
  const [failure, setFailure] = useState<{
    fingerprint: string;
    engine: string;
    message: string;
  } | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const inFlight = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const currentMemories = useRef(memories);
  currentMemories.current = memories;
  const settings = options.settings ?? defaultAISettings;
  const engine = settings.provider === "astra" ? "astra" : `ollama:${settings.model}`;
  const currentEngine = useRef(engine);
  currentEngine.current = engine;
  const currentFingerprint = fingerprint(memories);
  const failedFingerprint = failure?.engine === engine ? failure.fingerprint : undefined;
  const graphFingerprint = (graph?.engine ?? "astra") === engine ? graph?.fingerprint : undefined;

  useEffect(() => {
    mounted.current = true;
    setGraph(loadGraph());
    setReady(true);
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      inFlight.current?.abort();
      inFlight.current = null;
      if (mounted.current) setMapping(false);
    };
  }, [options.loaded, options.enabled, options.paused, currentFingerprint, engine]);

  useEffect(() => {
    if (
      !ready ||
      !options.loaded ||
      !options.enabled ||
      options.paused ||
      inFlight.current ||
      !memories.length ||
      graphFingerprint === currentFingerprint ||
      failedFingerprint === currentFingerprint
    )
      return;
    const snapshot = memories;
    const snapshotFingerprint = currentFingerprint;
    const snapshotEngine = engine;
    const timer = window.setTimeout(() => {
      if (inFlight.current || !mounted.current) return;
      const controller = new AbortController();
      inFlight.current = controller;
      setMapping(true);
      setFailure(null);
      void (async () => {
        try {
          const result = await mapWithProvider(
            { memories: snapshot, today: today() },
            settings,
            controller.signal,
          );
          if (
            controller.signal.aborted ||
            !mounted.current ||
            fingerprint(currentMemories.current) !== snapshotFingerprint ||
            currentEngine.current !== snapshotEngine
          )
            return;
          const next: SavedGraph = {
            connections: result.connections,
            fingerprint: snapshotFingerprint,
            mappedAt: new Date().toISOString(),
            engine: snapshotEngine,
            provider: settings.provider,
          };
          setGraph(next);
          try {
            saveGraph(next);
          } catch {
            /* The current map remains usable if storage is full. */
          }
        } catch (error) {
          if (
            !controller.signal.aborted &&
            mounted.current &&
            fingerprint(currentMemories.current) === snapshotFingerprint &&
            currentEngine.current === snapshotEngine
          ) {
            setFailure({
              fingerprint: snapshotFingerprint,
              engine: snapshotEngine,
              message:
                error instanceof Error
                  ? error.message
                  : "Connections couldn't be updated. Please try again.",
            });
          }
        } finally {
          if (inFlight.current === controller) {
            inFlight.current = null;
            if (mounted.current) setMapping(false);
          }
        }
      })();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [
    ready,
    options.loaded,
    options.enabled,
    options.paused,
    memories,
    currentFingerprint,
    graphFingerprint,
    failedFingerprint,
    mapping,
    retryVersion,
    engine,
    settings,
  ]);

  return {
    graph,
    mapping,
    stale: Boolean(memories.length && graphFingerprint !== currentFingerprint),
    error: failedFingerprint === currentFingerprint ? (failure?.message ?? null) : null,
    retry: () => {
      setFailure(null);
      setRetryVersion((value) => value + 1);
    },
  };
}
