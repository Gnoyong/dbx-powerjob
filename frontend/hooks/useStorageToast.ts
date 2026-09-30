import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { T } from "../uiTypes";

export function useStorageToast(id: string, failed: boolean, retry: () => void, t: T) {
  const retryRef = useRef(retry);
  retryRef.current = retry;
  const message = t("layoutStorageFailed");
  const retryLabel = t("retry");
  useEffect(() => {
    if (failed) toast.error(message, {
      id, duration: Infinity,
      action: { label: retryLabel, onClick: (event) => {
        event.preventDefault();
        retryRef.current();
      } },
    });
    else toast.dismiss(id);
    return () => { toast.dismiss(id); };
  }, [id, failed, message, retryLabel]);
}
