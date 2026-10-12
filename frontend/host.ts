import type { AppInfo, Instance, Job, JobDetail, LogPage, Page } from "./types";

type MethodResult = {
  "powerjob/apps": Page<AppInfo>;
  "powerjob/jobs": Page<Job>;
  "powerjob/job": JobDetail;
  "powerjob/instances": Page<Instance>;
  "powerjob/instance": Record<string, unknown>;
  "powerjob/log": LogPage;
  "powerjob/setJobEnabled": { success: boolean };
  "powerjob/deleteJob": { success: boolean };
  "powerjob/createJob": { success: boolean; jobId?: string };
  "powerjob/copyJob": { success: boolean; jobId?: string };
  "powerjob/updateJob": { success: boolean };
  "powerjob/retryFailedInstance": { success: boolean };
  "powerjob/runJob": { instanceId: string };
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
  invoke(method: string, params: Record<string, unknown>, options: { timeoutMs: number }): Promise<unknown>;
};

declare global {
  interface Window { dbxPlugin?: Host }
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

export async function readPanelSize(key: string, minimum: number): Promise<number | null> {
  const storage = await getStorage();
  if (!storage) return null;
  const value = await storage.get(key);
  return typeof value === "number" && Number.isFinite(value) && value >= minimum ? value : null;
}

export async function writePanelSize(key: string, value: number): Promise<void> {
  const storage = await getStorage();
  if (storage) await storage.set(key, Math.round(value));
}

export function invoke<K extends keyof MethodResult>(
  connectionId: string,
  method: K,
  params: Record<string, unknown> = {},
): Promise<MethodResult[K]> {
  return getHost().invoke(method, { connectionId, ...params }, { timeoutMs: 30000 }) as Promise<MethodResult[K]>;
}
