import { Button } from "./ui/button";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef } from "react";
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
  const { pages, loading, failed, nextIndex, totalPages, loadNext } = useLogs(
    connectionId,
    appId,
    instanceId,
  );
  const scroll = useRef<HTMLDivElement>(null);
  const autoFill = useRef(0);
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

  useEffect(() => {
    autoFill.current = 0;
    if (scroll.current) scroll.current.scrollTop = 0;
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
        {failed && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => void loadNext()}
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
        onScroll={(event) => {
          const panel = event.currentTarget;
          if (panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 80) {
            autoFill.current = 0;
            void loadNext();
          }
        }}
      >
        {lines.length ? (
          <div className="log-rows" style={{ height: virtualizer.getTotalSize() }}>
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
