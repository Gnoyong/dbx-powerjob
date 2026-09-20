import { statusLabel, statusTone } from "../format";
import type { Locale } from "../i18n";
import type { InstanceType } from "../types";

export function InstanceStatusBadge({
  value, type, locale,
}: {
  value: unknown;
  type: InstanceType;
  locale: Locale;
}) {
  return (
    <span className={`instance-status-badge instance-status-badge--${statusTone(value, type)}`}>
      {statusLabel(value, type, locale)}
    </span>
  );
}
