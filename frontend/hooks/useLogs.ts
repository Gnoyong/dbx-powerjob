import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "../host";
import type { LogPage } from "../types";

export function useLogs(connectionId: string, appId: string, instanceId: string) {
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [nextIndex, setNextIndex] = useState(0);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const state = useRef({
    seq: 0,
    index: 0,
    total: null as number | null,
    loading: false,
  });

  const loadNext = useCallback(async () => {
    const current = state.current;
    if (
      !connectionId ||
      !appId ||
      !instanceId ||
      current.loading ||
      (current.total !== null && current.index >= current.total)
    )
      return;
    const seq = current.seq;
    const index = current.index;
    current.loading = true;
    setLoading(true);
    setFailed(false);
    try {
      const result: LogPage = await invoke(connectionId, "powerjob/log", {
        appId,
        instanceId,
        index,
      });
      if (seq !== state.current.seq) return;
      current.index = result.index + 1;
      current.total = result.totalPages;
      current.loading = false;
      setPages((previous) =>
        index === 0 ? [result.data || ""] : [...previous, result.data || ""],
      );
      setNextIndex(current.index);
      setTotalPages(current.total);
      setLoading(false);
    } catch {
      if (seq !== state.current.seq) return;
      current.loading = false;
      setLoading(false);
      setFailed(true);
    }
  }, [connectionId, appId, instanceId]);

  useEffect(() => {
    state.current.seq++;
    state.current.index = 0;
    state.current.total = null;
    state.current.loading = false;
    setPages([]);
    setNextIndex(0);
    setTotalPages(null);
    setFailed(false);
    setLoading(false);
    if (instanceId) void loadNext();
    return () => {
      state.current.seq++;
    };
  }, [instanceId, loadNext]);
  return { pages, loading, failed, nextIndex, totalPages, loadNext };
}
