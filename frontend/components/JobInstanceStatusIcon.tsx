import { CircleCheck, CircleDashed, CircleHelp, CirclePlay, CircleStop, CircleX, Clock3, LoaderCircle, TriangleAlert } from "lucide-react";
import { statusLabel, statusTone } from "../format";
import type { Locale } from "../i18n";
import type { LatestJobInstance } from "../types";
import type { T } from "../uiTypes";

const statusIcons = {
  pending: Clock3, running: CirclePlay, success: CircleCheck,
  failed: CircleX, stopped: CircleStop, unknown: CircleHelp,
};

export function JobInstanceStatusIcon({ latest, locale, t }: {
  latest?: LatestJobInstance;
  locale: Locale;
  t: T;
}) {
  const instance = latest?.instance;
  const tone = instance ? statusTone(instance.status, "NORMAL") : latest?.error ? "failed" : "unknown";
  const Icon = instance ? statusIcons[tone] : !latest ? LoaderCircle : latest.error ? TriangleAlert : CircleDashed;
  const text = instance ? statusLabel(instance.status, "NORMAL", locale)
    : t(!latest ? "loading" : latest.error ? "latestInstanceFailed" : "noInstanceRecords");
  const stale = Boolean(instance && latest?.error);
  const description = `${t("latestInstance")}: ${text}${stale ? ` · ${t("latestInstanceUpdateFailed")}` : ""}`;

  return (
    <span className={`job-instance-status instance-status-badge--${tone}`} role="img" aria-label={description} title={description}>
      <Icon data-icon="inline-start" aria-hidden="true" className={!latest ? "job-instance-loading" : undefined} />
      {stale && <TriangleAlert className="job-instance-warning" aria-hidden="true" />}
      <span className="sr-only" aria-hidden="true">{text}</span>
      {stale && <span className="sr-only" aria-hidden="true">{t("latestInstanceUpdateFailed")}</span>}
    </span>
  );
}
