import { Save, X } from "lucide-react";
import type { Locale, TranslationKey } from "../i18n";
import type { JobDetail } from "../types";
import type { T } from "../uiTypes";
import { JobInspector } from "./JobInspector";
import { Button } from "./ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "./ui/dialog";

const newJobDefaults: JobDetail = {
  jobName: "",
  jobDescription: "",
  enable: true,
  timeExpressionType: "",
  timeExpression: "",
  executeType: "",
  processorType: "",
  processorInfo: "",
  jobParams: "",
  maxInstanceNum: 0,
  concurrency: 5,
  instanceTimeLimit: 0,
  instanceRetryNum: 0,
  taskRetryNum: 1,
  dispatchStrategy: "HEALTH_FIRST",
  dispatchStrategyConfig: "",
  minCpuCores: 0,
  minMemorySpace: 0,
  minDiskSpace: 0,
  designatedWorkers: "",
  maxWorkerCount: 0,
  lifeCycle: null,
  alarmConfig: {
    alertThreshold: 0,
    statisticWindowLen: 0,
    silenceWindowLen: 0,
  },
  logConfig: { type: 1, level: null, loggerName: "" },
};

function createInitialJob(source?: JobDetail): JobDetail {
  if (!source) return newJobDefaults;
  const initial: JobDetail = {};
  for (const [field, fallback] of Object.entries(newJobDefaults)) {
    initial[field] = field in source ? source[field] : fallback;
  }
  initial.jobName = `${String(source.jobName ?? "")}_copy`;
  return initial;
}

function submitCreateJob() {
  document
    .getElementById("create-job-form")
    ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

export function CreateJobDialog({
  busy,
  copySource,
  error,
  locale,
  onCreate,
  onClose,
  onEdit,
  t,
}: {
  busy: boolean;
  copySource?: JobDetail;
  error: TranslationKey | null;
  locale: Locale;
  onCreate: (job: Record<string, unknown>) => void;
  onClose: () => void;
  onEdit: () => void;
  t: T;
}) {
  const initialJob = createInitialJob(copySource);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="create-job-dialog">
        <div className="dialog-head">
          <DialogTitle>{t(copySource ? "copyJob" : "newJob")}</DialogTitle>
          <DialogClose asChild>
            <Button
              size="xs"
              type="button"
              variant="ghost"
              disabled={busy}
              aria-label={t("close")}
            >
              <X aria-hidden="true" />
            </Button>
          </DialogClose>
        </div>
        <div className="create-job-dialog-body">
          <JobInspector
            detail={initialJob}
            status="selectJobDetail"
            mode="create"
            busy={busy}
            error={error}
            onSave={onCreate}
            onEdit={onEdit}
            formId="create-job-form"
            locale={locale}
            t={t}
          />
        </div>
        <footer className="create-job-dialog-footer">
          <Button
            size="xs"
            type="button"
            disabled={busy}
            onClick={submitCreateJob}
          >
            <Save
              size={14}
              aria-hidden="true"
            />{" "}
            {t(busy ? "creatingJob" : "createJob")}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
