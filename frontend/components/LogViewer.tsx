import { Button } from "./ui/button";
import { useEffect, useRef } from "react";
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
  const content = pages.join("");

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
        <pre>
          {!instanceId
            ? t("selectInstanceLog")
            : failed && pages.length === 0
              ? t("logFailed")
              : loading && pages.length === 0
                ? t("loadingLogs")
                : !content && !more && !loading
                  ? t("noLogs")
                  : content}
        </pre>
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
