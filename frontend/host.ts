import type { AppInfo, Instance, Job, JobDetail, LatestJobInstance, LogPage, Page } from "./types";
import type {
  WorkflowDefinition,
  WorkflowInstance,
  SaveOperation,
  WorkflowActionResult,
} from "./workflow/types";

type MethodResult = {
  "powerjob/users": NotificationUser[];
  "powerjob/workflowCapabilities": { readOnly: boolean };
  "powerjob/workflows": Page<WorkflowDefinition>;
  "powerjob/workflow": WorkflowDefinition;
  "powerjob/workflowInstances": Page<WorkflowInstance>;
  "powerjob/workflowInstance": WorkflowInstance;
  "powerjob/saveWorkflow": SaveOperation;
  "powerjob/workflowSaveStatus": SaveOperation;
  "powerjob/runWorkflow": { wfInstanceId: string };
  "powerjob/setWorkflowEnabled": WorkflowDefinition;
  "powerjob/copyWorkflow": WorkflowDefinition;
  "powerjob/deleteWorkflow": WorkflowActionResult;
  "powerjob/stopWorkflowInstance": WorkflowActionResult;
  "powerjob/retryWorkflowInstance": WorkflowActionResult;
  "powerjob/markWorkflowNodeSuccess": WorkflowActionResult;
  "powerjob/apps": Page<AppInfo>;
  "powerjob/jobs": Page<Job>;
  "powerjob/job": JobDetail;
  "powerjob/instances": Page<Instance>;
  "powerjob/latestJobInstances": { data: LatestJobInstance[] };
  "powerjob/instance": Record<string, unknown>;
  "powerjob/log": LogPage;
  "powerjob/setJobEnabled": { success: boolean };
  "powerjob/deleteJob": { success: boolean };
  "powerjob/createJob": { success: boolean; jobId?: string };
  "powerjob/copyJob": { success: boolean; jobId?: string };
  "powerjob/updateJob": { success: boolean };
  "powerjob/retryFailedInstance": { success: boolean };
  "powerjob/stopInstance": { success: boolean };
  "powerjob/runJob": { instanceId: string };
};

export type NotificationUser = {
  id: string;
  username?: string;
  showName?: string | null;
  enable?: boolean;
};

type Context = { connectionId?: string } | null;
type Host = {
  ready: Promise<void>;
  capabilities?: { storage?: boolean };
  storage?: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<unknown>;
    delete(key: string): Promise<unknown>;
  };
  locale?: string;
  context?: Context;
  onContext(callback: (context: Context) => void): (() => void) | void;
  invoke(
    method: string,
    params: Record<string, unknown>,
    options: { timeoutMs: number },
  ): Promise<unknown>;
};

declare global {
  interface Window {
    dbxPlugin?: Host;
  }
}

export function getHost(): Host {
  const host = window.dbxPlugin;
  if (!host) throw new Error("DBX plugin bridge unavailable");
  return host;
}

async function getStorage() {
  const host = getHost();
  await host.ready;
  return host.capabilities?.storage ? host.storage : undefined;
}

export type SavedApplication = { appId: string; pageIndex: number };

function applicationStorageKey(connectionId: string): string {
  return `local.powerjob.readonly.last-application:${connectionId}`;
}

export async function readSavedApplication(connectionId: string): Promise<SavedApplication | null> {
  const storage = await getStorage();
  if (!storage) return null;
  const value = await storage.get(applicationStorageKey(connectionId));
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const saved = value as Partial<SavedApplication>;
  return typeof saved.appId === "string" && saved.appId.length > 0 &&
    typeof saved.pageIndex === "number" && Number.isInteger(saved.pageIndex) && saved.pageIndex >= 0
    ? { appId: saved.appId, pageIndex: saved.pageIndex }
    : null;
}

export async function writeSavedApplication(connectionId: string, selection: SavedApplication): Promise<void> {
  const storage = await getStorage();
  if (storage) await storage.set(applicationStorageKey(connectionId), selection);
}


const pendingPanelWrites = new Map<string, Promise<void>>();

export async function readPanelSize(
  key: string,
  minimum: number,
): Promise<number | null> {
  await pendingPanelWrites.get(key);
  const storage = await getStorage();
  if (!storage) return null;
  const value = await storage.get(key);
  return typeof value === "number" && Number.isFinite(value) && value >= minimum
    ? value
    : null;
}

export function writePanelSize(
  key: string,
  value: number,
): Promise<void> {
  const write = async () => {
    const storage = await getStorage();
    if (storage) await storage.set(key, Math.round(value));
  };
  const previous = pendingPanelWrites.get(key);
  const pending = previous ? previous.catch(() => {}).then(write) : write();
  pendingPanelWrites.set(key, pending);
  const clear = () => {
    if (pendingPanelWrites.get(key) === pending) pendingPanelWrites.delete(key);
  };
  void pending.then(clear, clear);
  return pending;
}

export function invoke<K extends keyof MethodResult>(
  connectionId: string,
  method: K,
  params: Record<string, unknown> = {},
): Promise<MethodResult[K]> {
  return getHost().invoke(
    method,
    { connectionId, ...params },
    { timeoutMs: 30000 },
  ) as Promise<MethodResult[K]>;
}
