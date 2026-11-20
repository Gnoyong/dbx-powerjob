import { useCallback, useEffect, useState } from "react";
import { invoke } from "../host";
import type { Job, JobEnabledFilter, Page } from "../types";
import type { TranslationKey } from "../i18n";

export function useJobs(connectionId: string | null, appId: string) {
  const [jobsIndex, setJobsIndex] = useState(0);
  const [draftKeyword, setDraftKeyword] = useState("");
  const [keyword, setKeyword] = useState("");
  const [enabledFilter, setEnabledFilter] = useState<JobEnabledFilter>("all");
  const [jobs, setJobs] = useState<Page<Job> | null>(null);
  const [jobsStatus, setJobsStatus] =
    useState<TranslationKey>("selectConnection");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [refresh, setRefresh] = useState(0);
  const scope = JSON.stringify([connectionId, appId]);
  const [owner, setOwner] = useState(scope);
  useEffect(() => {
    setOwner(scope);
    setJobsIndex(0);
    setJobs(null);
    setSelectedJobId("");
    setEnabledFilter("all");
  }, [scope]);
  useEffect(() => { setKeyword(""); setDraftKeyword(""); }, [connectionId]);
  useEffect(() => {
    if (owner !== scope) return;
    if (!connectionId || !appId) {
      setJobsStatus(!connectionId ? "selectConnection" : "noAccessibleJobs");
      return;
    }
    let active = true;
    setJobsStatus("loadingJobs");
    void invoke(connectionId, "powerjob/jobs", {
      appId,
      index: jobsIndex,
      pageSize: 20,
      keyword,
      enabled: enabledFilter,
    })
      .then((page) => {
        if (!active) return;
        setJobs(page);
        setJobsStatus(page.data.length ? "loading" : "noJobs");
        setSelectedJobId((previous) =>
          page.data.some((item) => String(item.id) === previous)
            ? previous
            : String(page.data[0]?.id ?? ""),
        );
      })
      .catch(() => {
        if (!active) return;
        setJobs(null);
        setSelectedJobId("");
        setJobsStatus("jobsFailed");
      });
    return () => {
      active = false;
    };
  }, [connectionId, appId, jobsIndex, keyword, refresh, owner, scope, enabledFilter]);
  function searchJobs() {
    setJobsIndex(0);
    const next = draftKeyword.trim();
    if (next === keyword && jobsIndex === 0) setRefresh((value) => value + 1);
    else setKeyword(next);
  }
  const refreshJobs = useCallback(() => setRefresh(value => value + 1), []);
  function selectJob(id: string) { setSelectedJobId(id); }
  function onEnabledFilterChange(filter: JobEnabledFilter) {
    setEnabledFilter(filter);
    setJobsIndex(0);
    setJobs(null);
    setJobsStatus("loadingJobs");
    setSelectedJobId("");
  }
  function jobDeleted(id: string) {
    if (id === selectedJobId) setSelectedJobId("");
    if (jobs?.data.length === 1 && jobsIndex > 0) setJobsIndex(value => Math.max(0, value - 1));
    else refreshJobs();
  }
  function patchEnabled(id: string, enabled: boolean) {
    if (enabledFilter !== "all") {
      refreshJobs();
      return;
    }
    setJobs(previous => previous ? {
      ...previous, data: previous.data.map(job =>
        String(job.id) === id ? { ...job, enable: enabled } : job)
    } : previous);
  }
  const currentJobs = owner === scope ? jobs : null;
  return {
    jobs: currentJobs, jobsStatus, jobsLoading: owner !== scope || jobsStatus === "loadingJobs",
    draftKeyword, setDraftKeyword, enabledFilter, onEnabledFilterChange,
    selectedJobId: owner === scope ? selectedJobId : "",
    selectedJob: currentJobs?.data.find(item => String(item.id) === selectedJobId) ?? null,
    searchJobs, selectJob, pageJobs: setJobsIndex, refreshJobs, refresh, jobDeleted, patchEnabled
  };
}

