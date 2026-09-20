import type { AppInfo, Instance, Job, JobDetail, LogPage, Page } from "./types";

type MethodResult = {
  "powerjob/apps": Page<AppInfo>;
  "powerjob/jobs": Page<Job>;
  "powerjob/job": JobDetail;
  "powerjob/instances": Page<Instance>;
  "powerjob/instance": Record<string, unknown>;
  "powerjob/log": LogPage;
  "powerjob/setJobEnabled": { success: boolean };
  "powerjob/updateJob": { success: boolean };
  "powerjob/retryFailedInstance": { success: boolean };
  "powerjob/runJob": { instanceId: string };
};

type Context = { connectionId?: string } | null;
type Host = {
  ready: Promise<void>;
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

export function invoke<K extends keyof MethodResult>(
  connectionId: string,
  method: K,
  params: Record<string, unknown> = {},
): Promise<MethodResult[K]> {
  return getHost().invoke(method, { connectionId, ...params }, { timeoutMs: 30000 }) as Promise<MethodResult[K]>;
}
