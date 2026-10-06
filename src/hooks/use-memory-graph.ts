import { useEffect, useRef, useState } from "react";
import { mapMemories } from "@/lib/astra";
import {
  fingerprint,
  loadGraph,
  saveGraph,
  today,
  type Memory,
  type SavedGraph,
} from "@/lib/memory";

// Map updates are separate from reflective briefings. One request at a time;
// changes during a request discard its stale result and schedule a fresh pass.
export function useMemoryGraph(
  memories: Memory[],
  options: { loaded: boolean; enabled: boolean; paused: boolean },
) {
  const [graph, setGraph] = useState<SavedGraph | null>(null);
  const [ready, setReady] = useState(false);
  const [mapping, setMapping] = useState(false);
  const [failure, setFailure] = useState<{ fingerprint: string; message: string } | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const currentMemories = useRef(memories);
  currentMemories.current = memories;
  const currentFingerprint = fingerprint(memories);
  const failedFingerprint = failure?.fingerprint;
  const graphFingerprint = graph?.fingerprint;

  useEffect(() => {
    mounted.current = true;
    setGraph(loadGraph());
    setReady(true);
    return () => {
      mounted.current = false;
    };
  }, []);

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
    const timer = window.setTimeout(() => {
      if (inFlight.current || !mounted.current) return;
      inFlight.current = true;
      setMapping(true);
      setFailure(null);
      void (async () => {
        try {
          const result = await mapMemories({ data: { memories: snapshot, today: today() } });
          if (!mounted.current || fingerprint(currentMemories.current) !== snapshotFingerprint)
            return;
          const next: SavedGraph = {
            connections: result.connections,
            fingerprint: snapshotFingerprint,
            mappedAt: new Date().toISOString(),
          };
          setGraph(next);
          try {
            saveGraph(next);
          } catch {
            /* The current map remains usable if storage is full. */
          }
        } catch (error) {
          if (mounted.current && fingerprint(currentMemories.current) === snapshotFingerprint) {
            setFailure({
              fingerprint: snapshotFingerprint,
              message:
                error instanceof Error
                  ? error.message
                  : "Connections couldn't be updated. Please try again.",
            });
          }
        } finally {
          inFlight.current = false;
          if (mounted.current) setMapping(false);
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
