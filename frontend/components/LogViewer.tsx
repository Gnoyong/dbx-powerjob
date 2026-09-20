import { Button } from "./ui/button";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLogs } from "../hooks/useLogs";
import type { T } from "../uiTypes";

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
  } = useLogs(connectionId, appId, instanceId);
  const scroll = useRef<HTMLDivElement>(null);
  const autoFill = useRef(0);
  const [followLatest, setFollowLatest] = useState(false);
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
    autoFill.current = 0;
    if (scroll.current) scroll.current.scrollTop = 0;
    setFollowLatest(false);
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
  if (failed) state = t("logFailed");
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
