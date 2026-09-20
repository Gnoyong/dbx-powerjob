import type { InstanceType } from "./types";
import type { Locale, TranslationKey } from "./i18n";
import { translate } from "./i18n";

export function label(value: unknown): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

const statusKeys: Record<InstanceType, Record<string, TranslationKey>> = {
  NORMAL: {
    "1": "instanceWaitingDispatch", "2": "instanceWaitingWorker", "3": "instanceRunning",
    "4": "instanceFailed", "5": "instanceSucceeded", "9": "instanceCanceled", "10": "instanceStopped",
    WAITING_DISPATCH: "instanceWaitingDispatch", WAITING_WORKER_RECEIVE: "instanceWaitingWorker",
    RUNNING: "instanceRunning", FAILED: "instanceFailed", SUCCEED: "instanceSucceeded",
    CANCELED: "instanceCanceled", STOPPED: "instanceStopped",
  },
  WORKFLOW: {
    "1": "workflowWaiting", "2": "instanceRunning", "3": "instanceFailed",
    "4": "instanceSucceeded", "10": "instanceStopped",
    WAITING: "workflowWaiting", RUNNING: "instanceRunning", FAILED: "instanceFailed",
    SUCCEED: "instanceSucceeded", STOPPED: "instanceStopped",
  },
};

export function instanceStatusOptions(type: InstanceType): string[] {
  return Object.keys(statusKeys[type]).filter((value) => /^[A-Z_]+$/.test(value));
}

export function statusLabel(value: unknown, type: InstanceType, locale: Locale): string {
  const key = statusKeys[type][String(value).toUpperCase()];
  return key ? translate(locale, key) : label(value);
}

export type StatusTone = "pending" | "running" | "success" | "failed" | "stopped" | "unknown";

export function statusTone(value: unknown, type: InstanceType): StatusTone {
  const key = statusKeys[type][String(value).toUpperCase()];
  switch (key) {
    case "instanceWaitingDispatch":
    case "instanceWaitingWorker":
    case "workflowWaiting":
      return "pending";
    case "instanceRunning":
      return "running";
    case "instanceSucceeded":
      return "success";
    case "instanceFailed":
      return "failed";
    case "instanceCanceled":
    case "instanceStopped":
      return "stopped";
    default:
      return "unknown";
  }
}

export function dateLabel(value: unknown, locale: Locale): string {
  if (!value) return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return label(value);
  const date = new Date(number);
  return Number.isNaN(date.getTime()) ? label(value) : date.toLocaleString(locale);
}

export function isFailedNormalInstance(value: unknown, type: InstanceType): boolean {
  return type === "NORMAL" && statusKeys.NORMAL[String(value).toUpperCase()] === "instanceFailed";
}

export const jobFields: [string, TranslationKey][] = [
  ["id", "jobId"], ["jobName", "jobName"], ["jobDescription", "description"],
  ["enable", "enabled"], ["appId", "appId"], ["timeExpressionType", "timeExpressionType"],
  ["timeExpression", "timeExpression"], ["executeType", "executeType"],
  ["processorType", "processorType"], ["processorInfo", "processorInfo"],
  ["jobParams", "jobParams"], ["nextTriggerTimeStr", "nextTriggerTimeStr"],
  ["maxInstanceNum", "maxInstanceNum"], ["concurrency", "concurrency"],
  ["instanceTimeLimit", "instanceTimeLimit"], ["instanceRetryNum", "instanceRetryNum"],
  ["taskRetryNum", "taskRetryNum"], ["dispatchStrategy", "dispatchStrategy"],
  ["designatedWorkers", "designatedWorkers"], ["maxWorkerCount", "maxWorkerCount"],
  ["lifeCycle", "lifeCycle"], ["alarmConfig", "alarmConfig"],
  ["logConfig", "logConfig"], ["advancedRuntimeConfig", "advancedRuntimeConfig"],
  ["gmtCreate", "gmtCreate"], ["gmtModified", "gmtModified"],
];
