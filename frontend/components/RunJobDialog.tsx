import { useState } from "react";
import { label } from "../format";
import type { TranslationKey } from "../i18n";
import type { Job } from "../types";
import type { T } from "../uiTypes";
import { Button } from "./ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "./ui/dialog";

export function RunJobDialog({ job, busy, error, onRun, onClose, t }: {
  job: Job;
  busy: boolean;
  error: TranslationKey | null;
  onRun: (instanceParams: string) => void;
  onClose: () => void;
  t: T;
}) {
  const [instanceParams, setInstanceParams] = useState("");
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="run-job-dialog">
        <div className="dialog-head">
          <DialogTitle>{t("runJobTitle", { name: label(job.jobName), id: job.id })}</DialogTitle>
          <DialogClose asChild disabled={busy}>
            <Button type="button" variant="ghost" aria-label={t("close")}>×</Button>
          </DialogClose>
        </div>
        <p>{t("runJobWarning")}</p>
        <label htmlFor="run-instance-params">{t("instanceParams")}</label>
        <textarea id="run-instance-params" autoFocus value={instanceParams}
          maxLength={4096} disabled={busy} placeholder={t("optionalInstanceParams")}
          onChange={(event) => setInstanceParams(event.target.value)} />
        {error && <p className="run-job-error" role="alert">{t(error)}</p>}
        <div className="run-job-actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>{t("cancel")}</Button>
          <Button type="button" disabled={busy} onClick={() => onRun(instanceParams)}>
            {t(busy ? "runningJob" : "runJob")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
