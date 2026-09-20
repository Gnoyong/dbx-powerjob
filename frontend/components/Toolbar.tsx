import { Button } from "./ui/button";
import { NativeSelect, NativeSelectOption } from "./ui/native-select";
import { label } from "../format";
import type { TranslationKey } from "../i18n";
import type { AppInfo, Page } from "../types";
import type { T } from "../uiTypes";

export function Toolbar({
  appId, apps, appsLoading, appsStatus, onChooseApp, onPreviousApp,
  onNextApp, onRefresh, t,
}: {
  appId: string;
  apps: Page<AppInfo> | null;
  appsLoading: boolean;
  appsStatus: TranslationKey;
  onChooseApp: (appId: string) => void;
  onPreviousApp: () => void;
  onNextApp: () => void;
  onRefresh: () => void;
  t: T;
}) {
  const selectedIndex = apps?.data.findIndex((app) => String(app.id) === appId) ?? -1;
  const appNumber = apps && selectedIndex >= 0
    ? apps.index * apps.pageSize + selectedIndex + 1
    : 0;
  const hasPreviousApp = !!apps && selectedIndex >= 0 &&
    (apps.index > 0 || selectedIndex > 0);
  const hasNextApp = !!apps && selectedIndex >= 0 &&
    (apps.index + 1 < apps.totalPages || selectedIndex + 1 < apps.data.length);
  return (
    <header className="toolbar">
      <div className="app-picker">
        <label htmlFor="app-select">{t("app")}</label>
        <NativeSelect id="app-select" value={appId}
          disabled={!apps?.data.length || appsLoading}
          onChange={(event) => onChooseApp(event.target.value)}>
          {!apps?.data.length && <NativeSelectOption value="">{t(appsStatus)}</NativeSelectOption>}
          {apps?.data.map((app) => (
            <NativeSelectOption key={app.id} value={app.id}>
              {label(app.title || app.appName || app.id)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button type="button" variant="ghost" aria-label={t("previousApp")}
          disabled={appsLoading || !hasPreviousApp}
          onClick={onPreviousApp}>‹</Button>
        <span className="page-label">
          {`${appNumber} / ${apps?.totalItems ?? 0}`}
        </span>
        <Button type="button" variant="ghost" aria-label={t("nextApp")}
          disabled={appsLoading || !hasNextApp}
          onClick={onNextApp}>›</Button>
      </div>
      <div className="toolbar-actions">
        <span className="readonly">{t("readonly")}</span>
        <Button type="button" variant="secondary" onClick={onRefresh}>
          {t("refresh")}
        </Button>
      </div>
    </header>
  );
}
