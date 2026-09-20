import { Button } from "./ui/button";
import { Input } from "./ui/input";
import type { FormEvent } from "react";
import { label } from "../format";
import type { TranslationKey } from "../i18n";
import type { Job, Page } from "../types";
import type { T } from "../uiTypes";
import { Pager } from "./Pager";

export function JobsPane({
  jobs,
  loading,
  status,
  draftKeyword,
  selectedJobId,
  onDraftKeywordChange,
  onSearch,
  onChooseJob,
  onPage,
  t,
}: {
  jobs: Page<Job> | null;
  loading: boolean;
  status: TranslationKey;
  draftKeyword: string;
  selectedJobId: string;
  onDraftKeywordChange: (value: string) => void;
  onSearch: (event: FormEvent) => void;
  onChooseJob: (job: Job) => void;
  onPage: (index: number) => void;
  t: T;
}) {
  return (
    <section
      id="jobs-pane"
      className="jobs-pane"
      aria-label={t("jobList")}
    >
      <div className="pane-bar">
        <strong>{t("jobs")}</strong>
        <form
          className="search-form"
          onSubmit={onSearch}
        >
          <label
            htmlFor="job-keyword"
            className="sr-only"
          >
            {t("jobKeyword")}
          </label>
          <Input
            id="job-keyword"
            type="search"
            placeholder={t("searchJobs")}
            maxLength={100}
            value={draftKeyword}
            onChange={(event) => onDraftKeywordChange(event.target.value)}
          />
          <Button
            type="submit"
            variant="secondary"
          >
            {t("search")}
          </Button>
        </form>
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
                type="button"
                className="job-item"
                aria-pressed={String(job.id) === selectedJobId}
                title={`${label(job.jobName)} · ${label(job.id)}`}
                onClick={() => onChooseJob(job)}
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
                  <span>{job.enable ? t("enabled") : t("disabled")}</span>
                </span>
              </Button>
            </div>
          ))
        )}
      </div>
      <Pager
        page={jobs}
        onPage={onPage}
        t={t}
      />
    </section>
  );
}
