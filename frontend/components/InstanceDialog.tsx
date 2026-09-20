import { useEffect, useRef, useState } from "react";
import { statusLabel } from "../format";
import { invoke } from "../host";
import type { Locale, TranslationKey } from "../i18n";
import type { Instance, InstanceType } from "../types";
import type { T } from "../uiTypes";

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
  const dialog = useRef<HTMLDialogElement>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState<TranslationKey>("loading");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
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
      element?.close();
    };
  }, [connectionId, appId, instance.instanceId]);
  const display = result ? { ...result } : null;
  if (display && Object.hasOwn(display, "status"))
    display.status = statusLabel(display.status, type, locale);
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
    >
      <div className="dialog-head">
        <h2>{t("instanceTitle", { id: instance.instanceId })}</h2>
        <button
          type="button"
          className="ghost"
          aria-label={t("close")}
          onClick={() => dialog.current?.close()}
        >
          ×
        </button>
      </div>
      <pre>{display ? JSON.stringify(display, null, 2) : t(status)}</pre>
    </dialog>
  );
}
