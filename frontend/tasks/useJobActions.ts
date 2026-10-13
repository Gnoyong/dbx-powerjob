import { useEffect, useRef, useState } from "react";
import { invoke } from "../host";
import { notifyAction } from "../notifications";
import type { ActionNotificationKey } from "../notifications";
import type { TranslationKey } from "../i18n";
import type { T } from "../uiTypes";
import { createActionGate } from "./actionGate";

type ActionResult<R> =
  | { status: "success"; value: R }
  | { status: "failed"; error: TranslationKey | null }
  | { status: "ignored" };

function actionErrorKey(error: unknown): TranslationKey | null {
  const message = error instanceof Error ? error.message : "";
  if (/read.only/i.test(message)) return "readOnlyAction";
  if (/session expired|access denied/i.test(message)) return "actionSessionExpired";
  if (/rejected the request|denied access/i.test(message)) return "powerJobDenied";
  if (/already changed|exported job changed|only failed normal instances|job was not updated|job was not found/i.test(message))
    return "actionStateChanged";
  if (/job state did not change/i.test(message)) return "actionNotApplied";
  return null;
}

export function useJobActions(connectionId: string | null, appId: string, selectedJobId: string, t: T) {
  const gate = useRef(createActionGate()).current;
  const scope = JSON.stringify([connectionId, appId, selectedJobId]);
  const invalidatedPending = gate.setScope(scope);
  const [, render] = useState(0);
  const latestT = useRef(t);
  latestT.current = t;
  useEffect(() => { notifyAction(latestT.current, null); }, [connectionId, appId]);
  useEffect(() => {
    if (invalidatedPending) notifyAction(latestT.current, null);
  }, [scope, invalidatedPending]);
  useEffect(() => () => {
    gate.invalidate();
    notifyAction(latestT.current, null);
  }, [gate]);

  async function execute<R>(
    request: (connection: string) => Promise<R>,
    loading: ActionNotificationKey,
    failure: ActionNotificationKey,
    success: ActionNotificationKey | null,
    vars?: (value: R) => Record<string, string | number>,
  ): Promise<ActionResult<R>> {
    if (!connectionId || !appId) return { status: "ignored" };
    const token = gate.begin();
    if (!token) return { status: "ignored" };
    render(value => value + 1);
    notifyAction(latestT.current, loading);
    try {
      const value = await request(connectionId);
      if (!gate.isCurrent(token)) return { status: "ignored" };
      notifyAction(latestT.current, success, null, vars?.(value));
      return { status: "success", value };
    } catch (error) {
      if (!gate.isCurrent(token)) return { status: "ignored" };
      const key = actionErrorKey(error);
      notifyAction(latestT.current, failure, key);
      return { status: "failed", error: key };
    } finally {
      if (gate.finish(token)) render(value => value + 1);
    }
  }

  return {
    busy: gate.busy,
    isBusy: () => gate.busy,
    clearNotification: () => notifyAction(latestT.current, null),
    update: (changes: Record<string, unknown>) => {
      if (!selectedJobId || !Object.keys(changes).length)
        return Promise.resolve<ActionResult<unknown>>({ status: "ignored" });
      return execute(connection => invoke(connection, "powerjob/updateJob", {
        appId, jobId: selectedJobId, changes,
      }), "savingJob", "jobUpdateFailed", "jobUpdated");
    },
    create: (job: Record<string, unknown>) => execute(connection => invoke(connection, "powerjob/createJob", {
      appId, job,
    }), "creatingJob", "jobCreateFailed", "jobCreated"),
    copy: (jobId: string, job: Record<string, unknown>) => execute(connection => invoke(connection, "powerjob/copyJob", {
      appId, jobId, job,
    }), "creatingJob", "jobCopyFailed", "jobCopied"),
    loadCopy: (jobId: string) => execute(connection => invoke(connection, "powerjob/job", {
      appId, jobId,
    }), "loadingJobCopy", "jobCopyLoadFailed", null),
    enable: (jobId: string, enabled: boolean) => execute(connection => invoke(connection, "powerjob/setJobEnabled", {
      appId, jobId, enabled,
    }), "savingJob", "jobActionFailed", enabled ? "jobEnabled" : "jobDisabled"),
    remove: (jobId: string) => execute(connection => invoke(connection, "powerjob/deleteJob", {
      appId, jobId,
    }), "deletingJob", "jobDeleteFailed", "jobDeleted"),
    run: (jobId: string, instanceParams: string) => execute(connection => invoke(connection, "powerjob/runJob", {
      appId, jobId, instanceParams,
    }), "runningJob", "runJobFailed", "jobRunRequested", value => ({ id: value.instanceId })),
    retry: (jobId: string, instanceId: string | number) => execute(connection => invoke(connection, "powerjob/retryFailedInstance", {
      appId, jobId, instanceId,
    }), "retryingInstance", "retryFailedMessage", "instanceRetried"),
  };
}
