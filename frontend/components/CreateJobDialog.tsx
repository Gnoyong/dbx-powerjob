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

export function CreateJobDialog({
  busy,
  error,
  locale,
  onCreate,
  onClose,
  onEdit,
  t,
}: {
  busy: boolean;
  error: TranslationKey | null;
  locale: Locale;
  onCreate: (job: Record<string, unknown>) => void;
  onClose: () => void;
  onEdit: () => void;
  t: T;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="create-job-dialog">
        <div className="dialog-head">
          <DialogTitle>{t("newJob")}</DialogTitle>
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
            detail={newJobDefaults}
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
            type="submit"
            form="create-job-form"
            disabled={busy}
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
