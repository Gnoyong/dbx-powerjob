import { toast } from "sonner";
import type { TranslationKey } from "./i18n";
import type { T } from "./uiTypes";

const actionKinds = {
  stoppingInstance: "loading", stopInstanceFailed: "error", instanceStopRequested: "success",
  savingJob: "loading", creatingJob: "loading", loadingJobCopy: "loading",
  deletingJob: "loading", runningJob: "loading", retryingInstance: "loading",
  jobUpdated: "success", jobCreated: "success", jobCopied: "success",
  jobEnabled: "success", jobDisabled: "success", jobDeleted: "success",
  jobRunRequested: "success", instanceRetried: "success",
  jobUpdateFailed: "error", jobCreateFailed: "error", jobCopyFailed: "error",
  jobCopyLoadFailed: "error", jobActionFailed: "error", jobDeleteFailed: "error",
  runJobFailed: "error", retryFailedMessage: "error",
} as const;

export type ActionNotificationKey = keyof typeof actionKinds;

export function notifyAction(
  t: T,
  key: ActionNotificationKey | null,
  detail?: TranslationKey | null,
  vars?: Record<string, string | number>,
) {
  const id = "powerjob-action";
  if (!key) {
    toast.dismiss(id);
    return;
  }
  const kind = actionKinds[key];
  toast[kind](t(key, vars), {
    id,
    description: detail ? t(detail) : undefined,
    duration: kind === "loading" ? Infinity : kind === "error" ? 8000 : 4000,
    closeButton: kind !== "loading",
  });
}
