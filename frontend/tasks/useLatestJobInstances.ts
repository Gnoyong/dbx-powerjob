import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "../host";
import type { Job, LatestJobInstance, Page } from "../types";

export type LatestJobInstanceMap = Record<string, LatestJobInstance>;
const pollIntervalMs = 30_000;

export function useLatestJobInstances(
  connectionId: string | null, appId: string, jobs: Page<Job> | null, visible: boolean,
) {
  const idsKey = JSON.stringify(jobs?.data.map(job => String(job.id)) ?? []);
  const scope = JSON.stringify([connectionId, appId, jobs?.index, idsKey]);
  const [snapshot, setSnapshot] = useState<{ scope: string; rows: LatestJobInstanceMap }>({ scope, rows: {} });
  // Shared across effect generations: a page switch waits for the old batch to finish.
  const inFlight = useRef<Promise<void> | null>(null);
  const refreshRef = useRef<(jobId?: string) => void>(() => {});
  const refresh = useCallback((jobId?: string) => refreshRef.current(jobId), []);

  useEffect(() => {
    const jobIds: string[] = JSON.parse(idsKey);
    if (!visible || !connectionId || !appId || !jobIds.length) return;
    const activeConnectionId = connectionId;
    let active = true;
    let draining = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const pending = new Set<string>();

    function merge(rows: LatestJobInstance[]) {
      if (!active) return;
      setSnapshot(previous => {
        const next = previous.scope === scope ? { ...previous.rows } : {};
        for (const row of rows) {
          next[row.jobId] = row.error && next[row.jobId]
            ? { ...next[row.jobId]!, error: row.error }
            : row;
        }
        return { scope, rows: next };
      });
    }

    async function drain() {
      if (draining || !active || document.hidden) return;
      draining = true;
      clearTimeout(timer);
      try {
        // Old page/connection responses cannot update this effect's snapshot.
        if (inFlight.current) await inFlight.current;
        while (active && !document.hidden && pending.size) {
          const batch = [...pending];
          pending.clear();
          const task = (async () => {
            try {
              const result = await invoke(activeConnectionId, "powerjob/latestJobInstances", { appId, jobIds: batch });
              const byId = new Map(result.data.map(row => [row.jobId, row]));
              const rows = batch.map(jobId => byId.get(jobId) ?? { jobId, instance: null, error: "Missing result" });
              failures = rows.some(row => row.error) ? failures + 1 : 0;
              merge(rows);
            } catch {
              failures++;
              merge(batch.map(jobId => ({ jobId, instance: null, error: "Query failed" })));
            }
          })();
          inFlight.current = task;
          await task;
          if (inFlight.current === task) inFlight.current = null;
        }
      } finally {
        draining = false;
        if (active && !document.hidden) {
          timer = setTimeout(() => enqueue(), pollIntervalMs * Math.min(4, 2 ** failures));
        }
      }
    }

    function enqueue(jobId?: string) {
      if (!active) return;
      for (const id of jobId ? [jobId] : jobIds) {
        if (jobIds.includes(id)) pending.add(id);
      }
      void drain();
    }
    function visibilityChanged() {
      clearTimeout(timer);
      if (!document.hidden) enqueue();
    }

    refreshRef.current = enqueue;
    document.addEventListener("visibilitychange", visibilityChanged);
    enqueue();
    return () => {
      active = false;
      clearTimeout(timer);
      pending.clear();
      refreshRef.current = () => {};
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [connectionId, appId, idsKey, scope, visible]);

  return { rows: snapshot.scope === scope ? snapshot.rows : {}, refresh };
}
