import { Button } from "./ui/button";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLogs, type LogExportProgress } from "../hooks/useLogs";
import type { T } from "../uiTypes";

type ExportState =
  | { status: "idle" }
  | ({ status: "exporting" } & LogExportProgress)
  | { status: "complete"; pageCount: number }
  | { status: "failed" };

function downloadLog(content: string, instanceId: string) {
  const url = URL.createObjectURL(new Blob([content], {
    type: "text/plain;charset=utf-8",
  }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `powerjob-instance-${instanceId}.log`;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function LogViewer({
  connectionId,
  appId,
  instanceId,
  t,
}: {
  connectionId: string;
  appId: string;
  instanceId: string;
  t: T;
}) {
  const {
    pages,
    loading,
    failed,
    nextIndex,
    totalPages,
    loadNext,
    refreshLatest,
    exportAll,
  } = useLogs(connectionId, appId, instanceId);
  const scroll = useRef<HTMLDivElement>(null);
  const autoFill = useRef(0);
  const exportController = useRef<AbortController | null>(null);
  const [followLatest, setFollowLatest] = useState(false);
  const [exportState, setExportState] = useState<ExportState>({
    status: "idle",
  });
  const more = totalPages !== null && nextIndex < totalPages;
  // A page can end in the middle of a line, so split only after joining pages.
  const content = useMemo(() => pages.join(""), [pages]);
  const lines = useMemo(() => (content ? content.split("\n") : []), [content]);
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 17,
    overscan: 8,
  });
  const totalSize = virtualizer.getTotalSize();

  function scrollToBottom() {
    const panel = scroll.current;
    if (panel) panel.scrollTop = panel.scrollHeight;
  }

  useEffect(() => {
    exportController.current?.abort();
    exportController.current = null;
    autoFill.current = 0;
    if (scroll.current) scroll.current.scrollTop = 0;
    setFollowLatest(false);
    setExportState({ status: "idle" });
    return () => exportController.current?.abort();
  }, [instanceId, appId]);
  useEffect(() => {
    if (!more || loading || failed || autoFill.current >= 4) return;
    const frame = requestAnimationFrame(() => {
      const panel = scroll.current;
      if (panel && panel.scrollHeight <= panel.clientHeight + 8) {
        autoFill.current++;
        void loadNext();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [pages, more, loading, failed, loadNext]);
  useEffect(() => {
    if (followLatest && more && !loading && !failed) void loadNext();
  }, [followLatest, more, loading, failed, loadNext]);
  useEffect(() => {
    if (!followLatest || more || loading || failed || totalPages === null)
      return;
    const timer = window.setInterval(() => void refreshLatest(), 3000);
    return () => window.clearInterval(timer);
  }, [followLatest, more, loading, failed, totalPages, refreshLatest]);
  useEffect(() => {
    if (!followLatest) return;
    const frame = requestAnimationFrame(scrollToBottom);
    return () => cancelAnimationFrame(frame);
  }, [followLatest, content, totalSize]);

  let state = "";
  if (exportState.status === "exporting")
    state = t("exportingLogs", {
      current: exportState.current,
      total: exportState.total,
    });
  else if (exportState.status === "complete")
    state = t("logsExported", { count: exportState.pageCount });
  else if (exportState.status === "failed") state = t("logExportFailed");
  else if (failed) state = t("logFailed");
  else if (loading) state = t("loading");
  else if (instanceId && totalPages !== null)
    state = more
      ? t("logPage", { current: nextIndex, total: totalPages })
      : t("logComplete");
  return (
    <div className="logs-pane">
      <div className="sub-pane-bar">
        <strong>{t("instanceLogs")}</strong>
        <span className="muted">{instanceId ? `#${instanceId}` : ""}</span>
        <span className="muted log-state">{state}</span>
        <div className="log-controls">
          <Button
            size="xs"

            type="button"
            variant="ghost"
            disabled={!lines.length}
            onClick={() => {
              setFollowLatest(false);
              if (scroll.current) scroll.current.scrollTop = 0;
            }}
          >
            {t("logToTop")}
          </Button>
          <Button
            size="xs"
            type="button"
            variant="ghost"
            disabled={!lines.length}
            onClick={scrollToBottom}
          >
            {t("logToBottom")}
          </Button>
          <Button
            size="xs"
            type="button"
            variant="ghost"
            disabled={!instanceId}
            aria-pressed={followLatest}
            onClick={() => {
              setFollowLatest((current) => !current);
              if (!followLatest) scrollToBottom();
            }}
          >
            {t("logFollowLatest")}
          </Button>
          <Button
            size="xs"
            type="button"
            variant="ghost"
            disabled={!instanceId || exportState.status === "exporting"}
            onClick={async () => {
              exportController.current?.abort();
              const controller = new AbortController();
              exportController.current = controller;
              setExportState({ status: "exporting", current: 0, total: 0 });
              try {
                const exported = await exportAll((progress) => {
                  setExportState({ status: "exporting", ...progress });
                }, controller.signal);
                downloadLog(exported.content, instanceId);
                setExportState({
                  status: "complete",
                  pageCount: exported.pageCount,
                });
              } catch {
                if (!controller.signal.aborted) {
                  setExportState({ status: "failed" });
                }
              } finally {
                if (exportController.current === controller) {
                  exportController.current = null;
                }
              }
            }}
          >
            {t("exportAllLogs")}
          </Button>
        </div>
        {failed && (
          <Button
            size="xs"
            type="button"
            variant="ghost"
            onClick={() =>
              void (nextIndex === 0 || more ? loadNext() : refreshLatest())
            }
          >
            {t("retry")}
          </Button>
        )}
      </div>
      <div
        ref={scroll}
        className="log-scroll"
        role="log"
        aria-label={t("instanceLogs")}
        onWheel={(event) => {
          if (event.deltaY < 0) setFollowLatest(false);
        }}
        onScroll={(event) => {
          const panel = event.currentTarget;
          const atBottom =
            panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 80;
          if (followLatest && !atBottom) setFollowLatest(false);
          if (atBottom) {
            autoFill.current = 0;
            void loadNext();
          }
        }}
      >
        {lines.length ? (
          <div
            className="log-rows"
            style={{ height: totalSize }}
          >
            {virtualizer.getVirtualItems().map((row) => (
              <pre
                key={row.key}
                data-index={row.index}
                ref={virtualizer.measureElement}
                className="log-row"
                style={{ transform: `translateY(${row.start}px)` }}
              >
                {lines[row.index]}
              </pre>
            ))}
          </div>
        ) : (
          <pre>
            {!instanceId
              ? t("selectInstanceLog")
              : failed && pages.length === 0
                ? t("logFailed")
                : loading && pages.length === 0
                  ? t("loadingLogs")
                  : !more && !loading
                    ? t("noLogs")
                    : null}
          </pre>
        )}
        {more && autoFill.current >= 4 && !loading && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              autoFill.current = 0;
              void loadNext();
            }}
          >
            {t("loadMore")}
          </Button>
        )}
      </div>
    </div>
  );
}
