import { useEffect, useState } from "react";
import { statusLabel } from "../format";
import { invoke } from "../host";
import type { Locale, TranslationKey } from "../i18n";
import type { Instance, InstanceType } from "../types";
import type { T } from "../uiTypes";
import { Button } from "./ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "./ui/dialog";

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
  const display = result ? { ...result } : null;
  if (display && Object.hasOwn(display, "status"))
    display.status = statusLabel(display.status, type, locale);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <div className="dialog-head">
          <DialogTitle>{t("instanceTitle", { id: instance.instanceId })}</DialogTitle>
          <DialogClose asChild>
            <Button type="button" variant="ghost" aria-label={t("close")}>×</Button>
          </DialogClose>
        </div>
        <pre>{display ? JSON.stringify(display, null, 2) : t(status)}</pre>
      </DialogContent>
    </Dialog>
  );
}
