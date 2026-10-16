import { Button } from "./ui/button";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLogs, type LogExportProgress } from "../hooks/useLogs";
import type { T } from "../uiTypes";
import { FileTransferUnavailableError, saveLogFile } from "../host";

type ExportState =
  { status: "idle" } | ({ status: "exporting" } & LogExportProgress);

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
  const exportToast = useRef<string | number | undefined>(undefined);
  const [scrollMode, setScrollMode] = useState<"idle" | "bottom" | "follow">("idle");
  const followLatest = scrollMode === "follow";
  const seekingBottom = scrollMode !== "idle";
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
    setScrollMode("idle");
    setExportState({ status: "idle" });
    return () => {
      exportController.current?.abort();
      if (exportToast.current !== undefined) toast.dismiss(exportToast.current);
    };
  }, [connectionId, instanceId, appId]);
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
    // Page progress must drive this too: fast responses can batch loading=true
    // and loading=false into one render, leaving the other dependencies unchanged.
    if (!seekingBottom || !more || loading || failed) return;
    // Yield between pages so immediate replies cannot form a nested React update
    // chain, and navigation/manual browsing can cancel before the next request.
    const timer = window.setTimeout(() => void loadNext(), 0);
    return () => window.clearTimeout(timer);
  }, [seekingBottom, nextIndex, more, loading, failed, loadNext]);
  useEffect(() => {
    if (!followLatest || more || loading || failed || totalPages === null)
      return;
    const timer = window.setInterval(() => void refreshLatest(), 3000);
    return () => window.clearInterval(timer);
  }, [followLatest, more, loading, failed, totalPages, refreshLatest]);
  useEffect(() => {
    if (!seekingBottom) return;
    const frame = requestAnimationFrame(() => {
      scrollToBottom();
      if (scrollMode === "bottom" && totalPages !== null && !more && !loading && !failed)
        setScrollMode("idle");
    });
    return () => cancelAnimationFrame(frame);
  }, [seekingBottom, scrollMode, content, totalSize, totalPages, more, loading, failed]);

  let state = "";
  if (exportState.status === "exporting")
    state = t("exportingLogs", {
      current: exportState.current,
      total: exportState.total,
    });
  else if (failed) state = t("logFailed");
  else if (loading) state = t("loading");
  else if (instanceId && totalPages !== null)
    state = more
      ? t("logPage", { current: nextIndex, total: totalPages })
      : t("logComplete");
  return (
    <div className="logs-pane @container">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 p-1">
        <strong className="shrink-0">{t("instanceLogs")}</strong>
        <span className="muted min-w-0 max-w-full truncate">
          {instanceId ? `#${instanceId}` : ""}
        </span>
        <span className="muted log-state min-w-0">{state}</span>
        <div className="log-controls w-full flex-wrap @min-[560px]:w-auto">
          <Button
            size="xs"
            type="button"
            variant="ghost"
            disabled={!lines.length}
            onClick={() => {
              setScrollMode("idle");
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
            onClick={() => {
              if (!followLatest) setScrollMode("bottom");
              scrollToBottom();
            }}
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
              setScrollMode(followLatest ? "idle" : "follow");
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
              if (exportController.current) return;
              const controller = new AbortController();
              exportController.current = controller;
              if (exportToast.current !== undefined)
                toast.dismiss(exportToast.current);
              const toastId = toast.loading(
                t("exportingLogs", { current: 0, total: 0 }),
                { closeButton: false },
              );
              exportToast.current = toastId;
              setExportState({ status: "exporting", current: 0, total: 0 });
              try {
                const exported = await exportAll((progress) => {
                  if (controller.signal.aborted) return;
                  setExportState({ status: "exporting", ...progress });
                  toast.loading(t("exportingLogs", progress), {
                    id: toastId,
                    closeButton: false,
                  });
                }, controller.signal);
                if (controller.signal.aborted) return;
                const saved = await saveLogFile(exported.content, instanceId, controller.signal);
                if (controller.signal.aborted) return;
                if (!saved) {
                  toast.dismiss(toastId);
                  return;
                }
                toast.success(
                  t("logsExported", { count: exported.pageCount }),
                  { id: toastId, closeButton: true, duration: 4000 },
                );
              } catch (error) {
                if (!controller.signal.aborted) {
                  toast.error(t(error instanceof FileTransferUnavailableError ? "logExportUnavailable" : "logExportFailed"), {
                    id: toastId,
                    closeButton: true,
                    duration: 8000,
                  });
                }
              } finally {
                if (exportController.current === controller) {
                  exportController.current = null;
                  if (!controller.signal.aborted)
                    setExportState({ status: "idle" });
                }
              }
            }}
          >
            {t("exportAllLogs")}
          </Button>
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
      </div>
      <div
        ref={scroll}
        className="log-scroll rounded border border-(--color-border) bg-(--color-muted,#eef1f5)"
        role="log"
        tabIndex={0}
        aria-label={t("instanceLogs")}
        onWheel={(event) => {
          if (event.deltaY < 0) setScrollMode("idle");
        }}
        onPointerDown={() => setScrollMode("idle")}
        onKeyDown={(event) => {
          if (["ArrowUp", "PageUp", "Home"].includes(event.key) ||
              (event.key === " " && event.shiftKey)) setScrollMode("idle");
        }}
        onScroll={(event) => {
          const panel = event.currentTarget;
          const atBottom =
            panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 80;
          // Layout changes and programmatic scrolling also emit scroll events.
          // Only explicit browsing input above may cancel a pending tail request.
          if (atBottom && !loading && !failed) {
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
