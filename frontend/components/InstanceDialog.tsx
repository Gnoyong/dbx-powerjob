import { useEffect, useState } from "react";
import { Clock3, ListTree, Server, TerminalSquare, X } from "lucide-react";
import { invoke } from "../host";
import type { Locale, TranslationKey } from "../i18n";
import type { Instance, InstanceType } from "../types";
import type { T } from "../uiTypes";
import { Button } from "./ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "./ui/dialog";
import { InstanceStatusBadge } from "./InstanceStatusBadge";

type InstanceDetail = {
  actualTriggerTime?: unknown;
  expectedTriggerTime?: unknown;
  finishedTime?: unknown;
  instanceParams?: unknown;
  jobParams?: unknown;
  queriedTaskDetailInfoList?: unknown;
  result?: unknown;
  runningTimes?: unknown;
  status?: unknown;
  subInstanceDetails?: unknown;
  taskDetail?: unknown;
  taskTrackerAddress?: unknown;
};

function hasContent(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function textValue(value: unknown, emptyLabel: string): string {
  if (!hasContent(value)) return emptyLabel;
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export function InstanceDialog({
  instance,
  type,
  connectionId,
  appId,
  locale,
  onClose,
  t,
}: {
  instance: Instance;
  type: InstanceType;
  connectionId: string;
  appId: string;
  locale: Locale;
  onClose: () => void;
  t: T;
}) {
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState<TranslationKey>("loading");
  useEffect(() => {
    let active = true;
    void invoke(connectionId, "powerjob/instance", {
      appId,
      instanceId: instance.instanceId,
    })
      .then((value) => {
        if (active) {
          setResult(value);
          setStatus("loading");
        }
      })
      .catch(() => {
        if (active) setStatus("instanceDetailFailed");
      });
    return () => {
      active = false;
    };
  }, [connectionId, appId, instance.instanceId]);
  const detail = result as InstanceDetail | null;
  const structuredDetails = detail
    ? [
        ["taskDetail", t("taskDetail")],
        ["queriedTaskDetailInfoList", t("queriedTaskDetails")],
        ["subInstanceDetails", t("subInstanceDetails")],
      ].filter(([key]) => hasContent(detail[key as keyof InstanceDetail]))
    : [];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="instance-detail-dialog">
        <div className="dialog-head">
          <DialogTitle>
            {t("instanceTitle", { id: instance.instanceId })}
          </DialogTitle>
          {result && Object.hasOwn(result, "status") && (
            <InstanceStatusBadge
              value={result.status}
              type={type}
              locale={locale}
            />
          )}
          <DialogClose asChild>
            <Button
              size="xs"
              type="button"
              variant="ghost"
              aria-label={t("close")}
            >
              <X aria-hidden="true" />
            </Button>
          </DialogClose>
        </div>
        {!detail ? (
          <div
            className="instance-detail-state"
            role={status === "instanceDetailFailed" ? "alert" : "status"}
          >
            {t(status)}
          </div>
        ) : (
          <div className="instance-detail-body">
            <section
              className="instance-detail-section"
              aria-labelledby="instance-timing-title"
            >
              <h3
                id="instance-timing-title"
                className="instance-detail-section-title"
              >
                <Clock3 aria-hidden="true" />
                {t("timing")}
              </h3>
              <dl className="instance-timing-grid">
                <div>
                  <dt>{t("expectedTriggerTime")}</dt>
                  <dd>{textValue(detail.expectedTriggerTime, t("notProvided"))}</dd>
                </div>
                <div>
                  <dt>{t("triggeredAt")}</dt>
                  <dd>{textValue(detail.actualTriggerTime, t("notProvided"))}</dd>
                </div>
                <div>
                  <dt>{t("finishedAt")}</dt>
                  <dd>{textValue(detail.finishedTime, t("notProvided"))}</dd>
                </div>
              </dl>
            </section>

            <section
              className="instance-detail-section"
              aria-labelledby="instance-runtime-title"
            >
              <h3
                id="instance-runtime-title"
                className="instance-detail-section-title"
              >
                <Server aria-hidden="true" />
                {t("runtime")}
              </h3>
              <dl className="instance-runtime-grid">
                <div>
                  <dt>{t("runningTimes")}</dt>
                  <dd>{textValue(detail.runningTimes, t("notProvided"))}</dd>
                </div>
                <div>
                  <dt>{t("taskTrackerAddress")}</dt>
                  <dd className="instance-detail-mono">
                    {textValue(detail.taskTrackerAddress, t("notProvided"))}
                  </dd>
                </div>
              </dl>
            </section>

            <section
              className="instance-detail-section"
              aria-labelledby="instance-params-title"
            >
              <h3
                id="instance-params-title"
                className="instance-detail-section-title"
              >
                <TerminalSquare aria-hidden="true" />
                {t("parametersAndResult")}
              </h3>
              <div className="instance-text-fields">
                <div>
                  <h4>{t("jobParams")}</h4>
                  <pre>{textValue(detail.jobParams, t("notProvided"))}</pre>
                </div>
                <div>
                  <h4>{t("instanceParams")}</h4>
                  <pre>{textValue(detail.instanceParams, t("notProvided"))}</pre>
                </div>
                <div>
                  <h4>{t("executionResult")}</h4>
                  <pre>{textValue(detail.result, t("notProvided"))}</pre>
                </div>
              </div>
            </section>

            {structuredDetails.length > 0 && (
              <section
                className="instance-detail-section"
                aria-labelledby="instance-structure-title"
              >
                <h3
                  id="instance-structure-title"
                  className="instance-detail-section-title"
                >
                  <ListTree aria-hidden="true" />
                  {t("taskDetails")}
                </h3>
                <div className="instance-text-fields">
                  {structuredDetails.map(([key, label]) => (
                    <div key={key}>
                      <h4>{label}</h4>
                      <pre>
                        {textValue(
                          detail[key as keyof InstanceDetail],
                          t("notProvided"),
                        )}
                      </pre>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
