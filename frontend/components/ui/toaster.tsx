import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Toaster } from "sonner";
import { normalizeLocale, translate } from "../../i18n";

export function PluginToaster() {
  const [environment, setEnvironment] = useState(() => ({
    dark: document.documentElement.dataset.dbxTheme === "dark",
    locale: normalizeLocale(window.dbxPlugin?.locale),
  }));

  useEffect(() => {
    let active = true;
    const update = () => {
      if (active) setEnvironment({
        dark: document.documentElement.dataset.dbxTheme === "dark",
        locale: normalizeLocale(window.dbxPlugin?.locale),
      });
    };
    window.addEventListener("dbx-plugin-env", update);
    void window.dbxPlugin?.ready.then(update).catch(() => {});
    return () => { active = false; window.removeEventListener("dbx-plugin-env", update); };
  }, []);

  return (
    <Toaster
      theme={environment.dark ? "dark" : "light"}
      position="top-right"
      closeButton
      richColors
      offset={16}
      containerAriaLabel={translate(environment.locale, "notifications")}
      toastOptions={{ closeButtonAriaLabel: translate(environment.locale, "close") }}
      style={{
        "--normal-bg": `var(--color-background, ${environment.dark ? "#18181b" : "#fff"})`,
        "--normal-text": `var(--color-foreground, ${environment.dark ? "#fafafa" : "#18181b"})`,
        "--normal-border": `var(--color-border, ${environment.dark ? "#3f3f46" : "#e4e4e7"})`,
        fontFamily: "inherit",
      } as CSSProperties}
    />
  );
}
