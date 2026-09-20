import { Button } from "./components/ui/button";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { label } from "./format";
import { getHost, invoke } from "./host";
import { normalizeLocale, translate } from "./i18n";
import type { Locale, TranslationKey } from "./i18n";
import type {
  AppInfo,
  Instance,
  InstanceType,
  Job,
  JobDetail,
  Page,
} from "./types";
import type { T } from "./uiTypes";
import { Toolbar } from "./components/Toolbar";
import { JobsPane } from "./components/JobsPane";
import { RunsPane } from "./components/RunsPane";
import { Splitter } from "./components/Splitter";
import { JobInspector } from "./components/JobInspector";
import { InstanceDialog } from "./components/InstanceDialog";

type Tab = "detail" | "runs";
type Filter = { type: InstanceType; instanceId: string };

export default function App() {
  const [locale, setLocale] = useState<Locale>("en");
  const t: T = (key, vars) => translate(locale, key, vars);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [hostFailed, setHostFailed] = useState(false);
  const [appsIndex, setAppsIndex] = useState(0);
  const [apps, setApps] = useState<Page<AppInfo> | null>(null);
  const [appsStatus, setAppsStatus] = useState<TranslationKey>("loading");
  const [appId, setAppId] = useState("");
  const [jobsIndex, setJobsIndex] = useState(0);
  const [draftKeyword, setDraftKeyword] = useState("");
  const [keyword, setKeyword] = useState("");
  const [jobs, setJobs] = useState<Page<Job> | null>(null);
  const [jobsStatus, setJobsStatus] =
    useState<TranslationKey>("selectConnection");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [detailStatus, setDetailStatus] =
    useState<TranslationKey>("selectJobDetail");
  const [tab, setTab] = useState<Tab>("detail");
  const [instanceIndex, setInstanceIndex] = useState(0);
  const [draftInstanceId, setDraftInstanceId] = useState("");
  const [draftType, setDraftType] = useState<InstanceType>("NORMAL");
  const [filter, setFilter] = useState<Filter>({
    type: "NORMAL",
    instanceId: "",
  });
  const [instances, setInstances] = useState<Page<Instance> | null>(null);
  const [instancesStatus, setInstancesStatus] =
    useState<TranslationKey>("selectJobInstances");
  const [selectedInstanceId, setSelectedInstanceId] = useState("");
  const [modal, setModal] = useState<Instance | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [appsRefresh, setAppsRefresh] = useState(0);
  const appPageEdge = useRef<"first" | "last" | null>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | void;
    let updateLocale: (() => void) | undefined;
    try {
      const host = getHost();
      void host.ready
        .then(() => {
          if (!active) return;
          updateLocale = () => setLocale(normalizeLocale(host.locale));
          updateLocale();
          window.addEventListener("dbx-plugin-env", updateLocale);
          const updateContext = (context: { connectionId?: string } | null) => {
            if (!active) return;
            setConnectionId((previous) =>
              previous === (context?.connectionId || "")
                ? previous
                : context?.connectionId || "",
            );
          };
          updateContext(host.context ?? null);
          unsubscribe = host.onContext(updateContext);
        })
        .catch(() => {
          if (active) setHostFailed(true);
        });
    } catch {
      setHostFailed(true);
    }
    return () => {
      active = false;
      if (updateLocale)
        window.removeEventListener("dbx-plugin-env", updateLocale);
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t("title");
  }, [locale]);

  useEffect(() => {
    appPageEdge.current = null;
    setAppsIndex(0);
    setApps(null);
    setAppId("");
    setJobsIndex(0);
    setKeyword("");
    setDraftKeyword("");
    setJobs(null);
    setSelectedJobId("");
    setInstances(null);
    setSelectedInstanceId("");
    setModal(null);
  }, [connectionId]);

  useEffect(() => {
    if (!connectionId) {
      setAppsStatus(connectionId === null ? "loading" : "selectConnection");
      return;
    }
    let active = true;
    setAppsStatus("loading");
    void invoke(connectionId, "powerjob/apps", {
      index: appsIndex,
      pageSize: 100,
    })
      .then((page) => {
        if (!active) return;
        const edge = appPageEdge.current;
        appPageEdge.current = null;
        setApps(page);
        setAppsStatus(page.data.length ? "loading" : "noApps");
        setAppId((previous) =>
          !edge && page.data.some((item) => String(item.id) === previous)
            ? previous
            : String(page.data[edge === "last" ? page.data.length - 1 : 0]?.id ?? ""),
        );
      })
      .catch(() => {
        if (!active) return;
        appPageEdge.current = null;
        setApps(null);
        setAppId("");
        setAppsStatus("unavailable");
      });
    return () => {
      active = false;
    };
  }, [connectionId, appsIndex, appsRefresh]);

  useEffect(() => {
    setJobsIndex(0);
    setJobs(null);
    setSelectedJobId("");
    setInstances(null);
    setSelectedInstanceId("");
    setModal(null);
  }, [appId]);

  useEffect(() => {
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
  }, [connectionId, appId, jobsIndex, keyword, refresh]);

  const selectedJob =
    jobs?.data.find((item) => String(item.id) === selectedJobId) ?? null;
  useEffect(() => {
    if (!connectionId || !appId || !selectedJobId) {
      setDetail(null);
      setDetailStatus("selectJobDetail");
      return;
    }
    let active = true;
    setDetail(null);
    setDetailStatus("loadingDetail");
    void invoke(connectionId, "powerjob/job", { appId, jobId: selectedJobId })
      .then((value) => {
        if (active) setDetail(value);
      })
      .catch(() => {
        if (active) setDetailStatus("detailFailed");
      });
    return () => {
      active = false;
    };
  }, [connectionId, appId, selectedJobId, jobs]);

  useEffect(() => {
    setInstanceIndex(0);
    setInstances(null);
    setSelectedInstanceId("");
    setModal(null);
    setInstancesStatus(selectedJobId ? "viewRuns" : "selectJobInstances");
  }, [selectedJobId, appId]);

  useEffect(() => {
    if (tab !== "runs" || !connectionId || !appId || !selectedJobId) return;
    let active = true;
    setInstancesStatus("loadingInstances");
    void invoke(connectionId, "powerjob/instances", {
      appId,
      jobId: selectedJobId,
      index: instanceIndex,
      pageSize: 20,
      type: filter.type,
      instanceId: filter.instanceId,
    })
      .then((page) => {
        if (!active) return;
        setInstances(page);
        setInstancesStatus(page.data.length ? "loading" : "noInstances");
        setSelectedInstanceId((previous) =>
          page.data.some((item) => String(item.instanceId) === previous)
            ? previous
            : String(page.data[0]?.instanceId ?? ""),
        );
      })
      .catch(() => {
        if (!active) return;
        setInstances(null);
        setSelectedInstanceId("");
        setInstancesStatus("instancesFailed");
      });
    return () => {
      active = false;
    };
  }, [connectionId, appId, selectedJobId, tab, instanceIndex, filter, jobs]);

  const selectedApp = apps?.data.find((item) => String(item.id) === appId);
  const appsLoading = !apps || apps.index !== appsIndex;
  const jobsLoading = jobsStatus === "loadingJobs";
  const instancesLoading = instancesStatus === "loadingInstances";
  const message = hostFailed
    ? "hostFailed"
    : connectionId === ""
      ? "openFromConnection"
      : appsStatus === "unavailable"
        ? "appsFailed"
        : jobsStatus === "jobsFailed"
          ? "jobsFailed"
          : "";

  function searchJobs(event: FormEvent) {
    event.preventDefault();
    setJobsIndex(0);
    const next = draftKeyword.trim();
    if (next === keyword && jobsIndex === 0) setRefresh((value) => value + 1);
    else setKeyword(next);
  }
  function searchInstances(event: FormEvent) {
    event.preventDefault();
    setInstanceIndex(0);
    setFilter({ type: draftType, instanceId: draftInstanceId.trim() });
  }
  function chooseApp(next: string) {
    setAppId(next);
    setJobsIndex(0);
    setDetail(null);
  }
  function stepApp(direction: -1 | 1) {
    if (!apps || appsLoading) return;
    const currentIndex = apps.data.findIndex((item) => String(item.id) === appId);
    if (currentIndex < 0) return;
    const nextIndex = currentIndex + direction;
    if (nextIndex >= 0 && nextIndex < apps.data.length) {
      const nextApp = apps.data[nextIndex];
      if (nextApp) chooseApp(String(nextApp.id));
    } else if (direction < 0 && apps.index > 0) {
      appPageEdge.current = "last";
      setAppsIndex(apps.index - 1);
    } else if (direction > 0 && apps.index + 1 < apps.totalPages) {
      appPageEdge.current = "first";
      setAppsIndex(apps.index + 1);
    }
  }
  function chooseJob(job: Job) {
    if (String(job.id) === selectedJobId) return;
    setSelectedJobId(String(job.id));
    setInstanceIndex(0);
    setDetail(null);
  }
  function chooseInstance(instance: Instance) {
    setSelectedInstanceId(String(instance.instanceId));
  }
  function refreshCurrent() {
    if (appId) setRefresh((value) => value + 1);
    else if (connectionId) {
      setApps(null);
      setAppsRefresh((value) => value + 1);
    }
  }

  return (
    <div className="shell">
      <Toolbar
        appId={appId}
        apps={apps}
        appsLoading={appsLoading}
        appsStatus={appsStatus}
        onChooseApp={chooseApp}
        onPreviousApp={() => stepApp(-1)}
        onNextApp={() => stepApp(1)}
        onRefresh={refreshCurrent}
        t={t}
      />
      <span
        className="sr-only"
        aria-live="polite"
      >
        {selectedApp
          ? label(selectedApp.title || selectedApp.appName)
          : t(appsStatus)}
      </span>
      {message && (
        <div
          role="status"
          className="message"
        >
          {t(message)}
        </div>
      )}
      <main className="workspace">
        <JobsPane
          jobs={jobs}
          loading={jobsLoading}
          status={jobsStatus}
          draftKeyword={draftKeyword}
          selectedJobId={selectedJobId}
          onDraftKeywordChange={setDraftKeyword}
          onSearch={searchJobs}
          onChooseJob={chooseJob}
          onPage={setJobsIndex}
          t={t}
        />
        <Splitter t={t} />
        <section
          id="detail-pane"
          className="detail-pane"
          aria-label={t("jobWorkspace")}
        >
          <div className="detail-bar">
            <strong>
              {selectedJob
                ? `${label(selectedJob.jobName)}  ·  #${selectedJob.id}`
                : t("selectJob")}
            </strong>
            <nav
              className="detail-tabs"
              aria-label={t("jobInfo")}
            >
              <Button
                type="button"
                className={tab === "detail" ? "active" : ""}
                aria-current={tab === "detail" ? "page" : undefined}
                onClick={() => setTab("detail")}
              >
                {t("jobDetail")}
              </Button>
              <Button
                type="button"
                className={tab === "runs" ? "active" : ""}
                aria-current={tab === "runs" ? "page" : undefined}
                onClick={() => setTab("runs")}
              >
                {t("runsAndLogs")}
              </Button>
            </nav>
          </div>
          <section
            className="job-detail-view"
            aria-label={t("jobDetail")}
            hidden={tab !== "detail"}
          >
            <JobInspector
              detail={
                detail && String(detail.id) === selectedJobId ? detail : null
              }
              status={detailStatus}
              t={t}
            />
          </section>
          <RunsPane
            visible={tab === "runs"}
            instances={instances}
            loading={instancesLoading}
            status={instancesStatus}
            draftInstanceId={draftInstanceId}
            draftType={draftType}
            filterType={filter.type}
            selectedInstanceId={selectedInstanceId}
            locale={locale}
            connectionId={connectionId || ""}
            appId={appId}
            selectedJobId={selectedJobId}
            onDraftInstanceIdChange={setDraftInstanceId}
            onDraftTypeChange={setDraftType}
            onSearch={searchInstances}
            onChooseInstance={chooseInstance}
            onOpenInstance={setModal}
            onPage={setInstanceIndex}
            t={t}
          />
        </section>
      </main>
      {modal && connectionId && (
        <InstanceDialog
          key={`${appId}:${modal.instanceId}`}
          instance={modal}
          type={filter.type}
          connectionId={connectionId}
          appId={appId}
          locale={locale}
          onClose={() => setModal(null)}
          t={t}
        />
      )}
    </div>
  );
}
