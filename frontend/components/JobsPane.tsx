import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { label } from "../format";
import type { TranslationKey } from "../i18n";
import type { Job, Page } from "../types";
import type { T } from "../uiTypes";
import { Pager } from "./Pager";

type JobMenu = { job: Job; x: number; y: number };

export function JobsPane({
  jobs,
  loading,
  status,
  draftKeyword,
  selectedJobId,
  onDraftKeywordChange,
  onSearch,
  onChooseJob,
  onCopyJob,
  onSetJobEnabled,
  onRunJob,
  busy,
  onPage,
  t,
}: {
  jobs: Page<Job> | null;
  loading: boolean;
  status: TranslationKey;
  draftKeyword: string;
  selectedJobId: string;
  onDraftKeywordChange: (value: string) => void;
  onSearch: () => void;
  onChooseJob: (job: Job) => void;
  onCopyJob: (job: Job) => void;
  onSetJobEnabled: (job: Job) => void;
  onRunJob: (job: Job) => void;
  busy: boolean;
  onPage: (index: number) => void;
  t: T;
}) {
  const [menu, setMenu] = useState<JobMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuItemRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!menu) return;
    menuItemRef.current?.focus();
    const closeOnOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenu(null);
        triggerRef.current?.focus();
      }
    };
    const close = () => setMenu(null);
    window.addEventListener("pointerdown", closeOnOutside);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutside);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  useEffect(() => setMenu(null), [jobs]);

  function openMenu(
    job: Job,
    trigger: HTMLButtonElement,
    x: number,
    y: number,
  ) {
    if (busy || typeof job.enable !== "boolean") return;
    triggerRef.current = trigger;
    setMenu({
      job,
      x: Math.max(4, Math.min(x, window.innerWidth - 180)),
      y: Math.max(4, Math.min(y, window.innerHeight - 108)),
    });
  }

  return (
    <section
      id="jobs-pane"
      className="jobs-pane"
      aria-label={t("jobList")}
    >
      <div className="pane-bar">
        <strong>{t("jobs")}</strong>
        <div
          className="search-form"
          role="search"
        >
          <label
            htmlFor="job-keyword"
            className="sr-only"
          >
            {t("jobKeyword")}
          </label>
          <Input
            className="h-7 "
            id="job-keyword"
            type="search"
            placeholder={t("searchJobs")}
            maxLength={100}
            value={draftKeyword}
            onChange={(event) => onDraftKeywordChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSearch();
              }
            }}
          />
          <Button
            size="xs"
            type="button"
            variant="secondary"
            onClick={onSearch}
          >
            {t("search")}
          </Button>
        </div>
      </div>
      <div
        className="jobs-list"
        role="list"
        aria-label={t("jobs")}
      >
        {loading || !jobs?.data.length ? (
          <div className="empty-pane">{t(status)}</div>
        ) : (
          jobs.data.map((job) => (
            <div
              className="job-item-wrap"
              role="listitem"
              key={job.id}
            >
              <Button
                size="xs"

                type="button"
                variant="ghost"
                className="job-item"
                aria-pressed={String(job.id) === selectedJobId}
                aria-haspopup={
                  typeof job.enable === "boolean" ? "menu" : undefined
                }
                aria-expanded={menu?.job.id === job.id}
                title={`${label(job.jobName)} · ${label(job.id)} · ${t("jobContextHint")}`}
                onClick={() => onChooseJob(job)}
                onContextMenu={(event) => {
                  if (typeof job.enable !== "boolean") return;
                  event.preventDefault();
                  openMenu(
                    job,
                    event.currentTarget,
                    event.clientX,
                    event.clientY,
                  );
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === "ContextMenu" ||
                    (event.shiftKey && event.key === "F10")
                  ) {
                    event.preventDefault();
                    const rect = event.currentTarget.getBoundingClientRect();
                    openMenu(
                      job,
                      event.currentTarget,
                      rect.left + 12,
                      rect.bottom,
                    );
                  }
                }}
              >
                <span className="job-main">
                  <span className="job-name">{label(job.jobName)}</span>
                  <span className="job-id">#{job.id}</span>
                </span>
                <span className="job-meta">
                  <span>
                    {[job.timeExpressionType, job.timeExpression]
                      .filter(Boolean)
                      .join(" · ") || t("noSchedule")}
                  </span>
                  <span
                    className={`job-enable-status job-enable-status--${job.enable ? "enabled" : "disabled"}`}
                  >
                    {job.enable ? t("enabled") : t("disabled")}
                  </span>
                </span>
              </Button>
            </div>
          ))
        )}
      </div>
      {menu && (
        <div
          id="job-context-menu"
          ref={menuRef}
          className="job-context-menu"
          role="menu"
          aria-label={t("jobActions")}
          style={{ left: menu.x, top: menu.y }}
        >
          <Button
            size="xs"

            ref={menuItemRef}
            type="button"
            variant="ghost"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setMenu(null);
              onRunJob(menu.job);
            }}
          >
            {t("runJob")}
          </Button>
          <Button
            size="xs"
            type="button"
            variant="ghost"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setMenu(null);
              onCopyJob(menu.job);
            }}
          >
            {t("copyJob")}
          </Button>
          <Button
            size="xs"

            type="button"
            variant="ghost"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setMenu(null);
              onSetJobEnabled(menu.job);
            }}
          >
            {t(menu.job.enable ? "disableJob" : "enableJob")}
          </Button>
        </div>
      )}
      <Pager
        page={jobs}
        onPage={onPage}
        t={t}
      />
    </section>
  );
}
