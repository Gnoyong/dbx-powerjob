import { statusLabel, statusTone } from "../format";
import type { Locale } from "../i18n";
import type { InstanceType } from "../types";
import { Badge } from "./ui/badge";

export function InstanceStatusBadge({
  value, type, locale,
}: {
  value: unknown;
  type: InstanceType;
  locale: Locale;
}) {
  return (
    <Badge variant="outline" className={`instance-status-badge instance-status-badge--${statusTone(value, type)}`}>
      {statusLabel(value, type, locale)}
    </Badge>
  );
}
