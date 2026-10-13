import { useCallback, useEffect, useState } from "react";
import { getHost } from "../host";
import { normalizeLocale, translate } from "../i18n";
import type { Locale } from "../i18n";
import type { T } from "../uiTypes";

export function useHostEnvironment() {
  const [locale, setLocale] = useState<Locale>("en");
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [hostFailed, setHostFailed] = useState(false);
  const t: T = useCallback((key, vars) => translate(locale, key, vars), [locale]);
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | void;
    let updateLocale: (() => void) | undefined;
    try {
      const host = getHost();
      void host.ready
        .then(() => {
          if (!active) return;
          updateLocale = () => setLocale(normalizeLocale(host.locale));
          updateLocale();
          window.addEventListener("dbx-plugin-env", updateLocale);
          const updateContext = (context: { connectionId?: string } | null) => {
            if (!active) return;
            setConnectionId((previous) =>
              previous === (context?.connectionId || "")
                ? previous
                : context?.connectionId || "",
            );
          };
          updateContext(host.context ?? null);
          unsubscribe = host.onContext(updateContext);
        })
        .catch(() => {
          if (active) setHostFailed(true);
        });
    } catch {
      setHostFailed(true);
    }
    return () => {
      active = false;
      if (updateLocale)
        window.removeEventListener("dbx-plugin-env", updateLocale);
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t("title");
  }, [locale, t]);
  return { connectionId, locale, hostFailed, t };
}
