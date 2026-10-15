import { useEffect, useImperativeHandle, useState } from "react";
import type { Ref } from "react";
import { Button } from "../components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../components/ui/resizable";
import { JobsPane } from "../components/JobsPane";
import { RunsPane } from "../components/RunsPane";
import { JobInspector } from "../components/JobInspector";
import { InstanceDialog } from "../components/InstanceDialog";
import { RunJobDialog } from "../components/RunJobDialog";
import { CreateJobDialog } from "../components/CreateJobDialog";
import { ConfirmActionDialog } from "../components/ConfirmActionDialog";
import { useStoredPanelSize } from "../hooks/useStoredPanelSize";
import { useStorageToast } from "../hooks/useStorageToast";
import { label } from "../format";
import type { Locale, TranslationKey } from "../i18n";
import type { Instance, Job, JobDetail } from "../types";
import type { T } from "../uiTypes";
import { useJobs } from "./useJobs";
import { useJobDetail } from "./useJobDetail";
import { useInstances } from "./useInstances";
import { useJobActions } from "./useJobActions";
import { useLatestJobInstances } from "./useLatestJobInstances";

type Confirmation =
  | { kind: "jobEnabled"; job: Job; enabled: boolean }
  | { kind: "deleteJob"; job: Job }
  | { kind: "retryInstance"; instance: Instance; jobId: string };
export type TaskWorkspaceHandle = { create: () => void; refresh: () => void };

export function TaskWorkspace({ connectionId, appId, locale, t, visible, ref, onBusyChange, onJobsFailed }: {
  connectionId: string | null;
  appId: string;
  locale: Locale;
  t: T;
  visible: boolean;
  ref: Ref<TaskWorkspaceHandle>;
  onBusyChange: (busy: boolean) => void;
  onJobsFailed: (failed: boolean) => void;
}) {
  const [tab, setTab] = useState<"detail" | "runs">("detail");
  const jobsState = useJobs(connectionId, appId);
  const { jobs, jobsStatus, jobsLoading, draftKeyword, setDraftKeyword, selectedJobId,
    selectedJob, searchJobs, pageJobs, refresh } = jobsState;
  const latestInstances = useLatestJobInstances(connectionId, appId, jobs, visible && !jobsLoading);
  const { detail, detailStatus } = useJobDetail(connectionId, appId, selectedJobId, refresh);
  const runs = useInstances(connectionId, appId, selectedJobId, visible && tab === "runs");
  const { instances, instancesStatus, instancesLoading, draftInstanceId, setDraftInstanceId,
    draftType, changeDraftType, draftStatus, setDraftStatus, filterType, selectedInstanceId,
    chooseInstance, searchInstances, pageInstances, instancesRefresh } = runs;
  const actions = useJobActions(connectionId, appId, selectedJobId, t);
  const actionBusy = actions.busy;
  const [modal, setModal] = useState<Instance | null>(null);
  const [runTarget, setRunTarget] = useState<Job | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [creating, setCreating] = useState(false);
  const [copySource, setCopySource] = useState<{ jobId: string; detail: JobDetail } | null>(null);
  const [editError, setEditError] = useState<TranslationKey | null>(null);
  const [runError, setRunError] = useState<TranslationKey | null>(null);
  const dialogScope = JSON.stringify([connectionId, appId, selectedJobId, visible]);
  const [dialogOwner, setDialogOwner] = useState(dialogScope);
  const dialogsCurrent = dialogOwner === dialogScope;
  const jobsLayout = useStoredPanelSize("local.powerjob.readonly.jobs-pane-width", 240);
  useStorageToast("jobs-layout", jobsLayout.failed, jobsLayout.retry, t);

  // Keep task query state mounted across workspace modes; only transient targets are cleared.
  useEffect(() => {
    setDialogOwner(dialogScope);
    setModal(null);
    setRunTarget(null);
    setConfirmation(null);
    setCreating(false);
    setCopySource(null);
    setEditError(null);
    setRunError(null);
  }, [connectionId, appId, selectedJobId, visible, dialogScope]);
  useEffect(() => { onBusyChange(actionBusy); }, [actionBusy, onBusyChange]);
  useEffect(() => { onJobsFailed(jobsStatus === "jobsFailed"); }, [jobsStatus, onJobsFailed]);
  useImperativeHandle(ref, () => ({
    create: startCreatingJob,
    refresh: () => {
      jobsState.refreshJobs();
      runs.refreshInstances();
    },
  }));

  function chooseJob(job: Job) {
    setCreating(false);
    jobsState.selectJob(String(job.id));
  }
  function startCreatingJob() {
    if (!connectionId || !appId || actions.isBusy()) return;
    setCopySource(null);
    setCreating(true);
    setEditError(null);
    actions.clearNotification();
  }
  async function updateJob(changes: Record<string, unknown>) {
    if (actions.isBusy()) return;
    setEditError(null);
    const result = await actions.update(changes);
    if (result.status === "success") jobsState.refreshJobs();
    else if (result.status === "failed") setEditError(result.error);
  }
  async function createJob(job: Record<string, unknown>) {
    if (actions.isBusy()) return;
    setEditError(null);
    const result = await actions.create(job);
    if (result.status === "success") {
      setCreating(false);
      jobsState.refreshJobs();
    }
    else if (result.status === "failed") setEditError(result.error);
  }
  async function copyJob(job: Record<string, unknown>) {
    if (!copySource || actions.isBusy()) return;
    setEditError(null);
    const result = await actions.copy(copySource.jobId, job);
    if (result.status === "success") {
      setCopySource(null);
      jobsState.refreshJobs();
    }
    else if (result.status === "failed") setEditError(result.error ?? "jobCopyFailed");
  }
  async function startCopyingJob(job: Job) {
    if (actions.isBusy()) return;
    setEditError(null);
    setCreating(false);
    setCopySource(null);
    const result = await actions.loadCopy(String(job.id));
    if (result.status === "success") setCopySource({
      jobId: String(job.id),
      detail: { ...result.value, jobName: result.value.jobName ?? job.jobName ?? "" }
    });
  }
  function requestSetJobEnabled(job: Job) {
    if (!connectionId || !appId || actions.isBusy() || typeof job.enable !== "boolean") return;
    setConfirmation({ kind: "jobEnabled", job, enabled: !job.enable });
  }
  async function setJobEnabled(job: Job, enabled: boolean) {
    const result = await actions.enable(String(job.id), enabled);
    if (result.status === "success") jobsState.patchEnabled(String(job.id), enabled);
  }
  function requestDeleteJob(job: Job) {
    if (!connectionId || !appId || actions.isBusy()) return;
    setConfirmation({ kind: "deleteJob", job });
  }
  async function deleteJob(job: Job) {
    const result = await actions.remove(String(job.id));
    if (result.status === "success") jobsState.jobDeleted(String(job.id));
  }
  async function runJob(instanceParams: string) {
    if (!runTarget || actions.isBusy()) return;
    const job = runTarget;
    setRunError(null);
    const result = await actions.run(String(job.id), instanceParams);
    if (result.status === "success") {
      setRunTarget(null);
      jobsState.selectJob(String(job.id));
      runs.showNormalRuns();
      latestInstances.refresh(String(job.id));
      setTab("runs");
    } else if (result.status === "failed") setRunError(result.error ?? "runJobFailed");
  }
  function requestRetryFailedInstance(instance: Instance) {
    if (!connectionId || !appId || !selectedJobId || actions.isBusy() || filterType !== "NORMAL") return;
    setConfirmation({ kind: "retryInstance", instance, jobId: selectedJobId });
  }
  async function retryFailedInstance(instance: Instance, jobId: string) {
    const result = await actions.retry(jobId, instance.instanceId);
    if (result.status === "success") {
      setModal(null);
      runs.refreshInstances();
      latestInstances.refresh(jobId);
    }
  }

  if (!visible) return null;
  return <>
    {!jobsLayout.ready ? <div role="status">{t("loading")}</div> : (
      <ResizablePanelGroup
        id="workspace-panel-group"
        className="workspace-panel-group"
        orientation="horizontal"
        onLayoutChanged={jobsLayout.onLayoutChanged}
      >
        <ResizablePanel
          id="jobs-panel"
          panelRef={jobsLayout.panelRef}
          className="workspace-panel"
          minSize={240}
          defaultSize={
            jobsLayout.size ?? (window.innerWidth <= 800 ? "36%" : "30%")
          }
          groupResizeBehavior="preserve-pixel-size"
          onResize={jobsLayout.onResize}
        >
          <JobsPane
            jobs={jobs}
            latestInstances={latestInstances.rows}
            locale={locale}
            loading={jobsLoading}
            status={jobsStatus}
            draftKeyword={draftKeyword}
            selectedJobId={selectedJobId}
            onDraftKeywordChange={setDraftKeyword}
            onSearch={searchJobs}
            onChooseJob={chooseJob}
            onCopyJob={startCopyingJob}
            onSetJobEnabled={requestSetJobEnabled}
            onDeleteJob={requestDeleteJob}
            onRunJob={(job) => {
              setRunError(null);
              setRunTarget(job);
            }}
            busy={actionBusy}
            onPage={pageJobs}
            t={t}
          />
        </ResizablePanel>
        <ResizableHandle withHandle aria-label={t("resizeJobsPane")} />
        <ResizablePanel
          id="details-panel"
          className="workspace-panel"
          minSize={520}
        >
          <section
            id="detail-pane"
            className="detail-pane"
            aria-label={t("jobWorkspace")}
          >
            <div className="detail-bar">
              <nav className="detail-tabs" aria-label={t("jobInfo")}>
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
              <strong>
                {selectedJob
                  ? `${label(selectedJob.jobName)}  ·  #${selectedJob.id}`
                  : t("selectJob")}
              </strong>
            </div>
            <section
              className="job-detail-view"
              aria-label={t("jobDetail")}
              hidden={tab !== "detail"}
            >
              <JobInspector
                key={`${appId}:${selectedJobId}:${refresh}`}
                detail={
                  detail && String(detail.id) === selectedJobId
                    ? {
                      ...detail,
                      enable: selectedJob?.enable ?? detail.enable,
                    }
                    : null
                }
                status={detailStatus}
                busy={actionBusy}
                error={editError}
                onSave={updateJob}
                onEdit={() => setEditError(null)}
                locale={locale}
                t={t}
              />
            </section>
            <RunsPane
              visible={visible && tab === "runs"}
              instances={instances}
              loading={instancesLoading}
              status={instancesStatus}
              draftInstanceId={draftInstanceId}
              draftType={draftType}
              draftStatus={draftStatus}
              filterType={filterType}
              selectedInstanceId={selectedInstanceId}
              locale={locale}
              connectionId={connectionId || ""}
              appId={appId}
              selectedJobId={selectedJobId}
              onDraftInstanceIdChange={setDraftInstanceId}
              onDraftTypeChange={changeDraftType}
              onDraftStatusChange={setDraftStatus}
              onSearch={searchInstances}
              onChooseInstance={chooseInstance}
              onOpenInstance={setModal}
              onRetryInstance={requestRetryFailedInstance}
              busy={actionBusy}
              logRefresh={instancesRefresh}
              onPage={pageInstances}
              t={t}
            />
          </section>
        </ResizablePanel>
      </ResizablePanelGroup>

    )}
    {dialogsCurrent && (creating || copySource) && (
      <CreateJobDialog
        key={copySource ? `${appId}:${copySource.jobId}` : appId}
        busy={actionBusy}
        copySource={copySource?.detail}
        error={editError}
        locale={locale}
        onCreate={copySource ? copyJob : createJob}
        onClose={() => {
          if (actionBusy) return;
          setCreating(false);
          setCopySource(null);
          setEditError(null);
        }}
        onEdit={() => setEditError(null)}
        t={t}
      />
    )}
    {dialogsCurrent && modal && connectionId && (
      <InstanceDialog
        key={`${appId}:${modal.instanceId}`}
        instance={modal}
        type={filterType}
        connectionId={connectionId}
        appId={appId}
        locale={locale}
        onClose={() => setModal(null)}
        t={t}
      />
    )}
    {dialogsCurrent && runTarget && (
      <RunJobDialog
        key={`${appId}:${runTarget.id}`}
        job={runTarget}
        busy={actionBusy}
        error={runError}
        onRun={runJob}
        onClose={() => setRunTarget(null)}
        t={t}
      />
    )}
    {dialogsCurrent && confirmation && (
      <ConfirmActionDialog
        title={
          confirmation.kind === "jobEnabled"
            ? t(confirmation.enabled ? "enableJob" : "disableJob")
            : confirmation.kind === "deleteJob"
              ? t("deleteJob")
              : t("retryFailed")
        }
        message={
          confirmation.kind === "jobEnabled"
            ? t(
              confirmation.enabled
                ? "confirmEnableJob"
                : "confirmDisableJob",
              {
                name: label(confirmation.job.jobName),
                id: confirmation.job.id,
              },
            )
            : confirmation.kind === "deleteJob"
              ? t("confirmDeleteJob", {
                name: label(confirmation.job.jobName),
                id: confirmation.job.id,
              })
              : t("confirmRetryFailed", {
                id: confirmation.instance.instanceId,
              })
        }
        confirmLabel={
          confirmation.kind === "jobEnabled"
            ? t(confirmation.enabled ? "enableJob" : "disableJob")
            : confirmation.kind === "deleteJob"
              ? t("deleteJob")
              : t("retryFailed")
        }
        destructive={confirmation.kind === "deleteJob"}
        busy={actionBusy}
        onConfirm={() => {
          const target = confirmation;
          setConfirmation(null);
          if (target.kind === "jobEnabled") {
            void setJobEnabled(target.job, target.enabled);
          } else if (target.kind === "deleteJob") {
            void deleteJob(target.job);
          } else {
            void retryFailedInstance(target.instance, target.jobId);
          }
        }}
        onClose={() => setConfirmation(null)}
        t={t}
      />
    )}

  </>;
}
