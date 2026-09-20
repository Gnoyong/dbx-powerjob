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
  return (
    <header className="toolbar">
      <div className="app-picker">
        <label htmlFor="app-select">{t("app")}</label>
        <select id="app-select" value={appId}
          disabled={!apps?.data.length || appsLoading}
          onChange={(event) => onChooseApp(event.target.value)}>
          {!apps?.data.length && <option value="">{t(appsStatus)}</option>}
          {apps?.data.map((app) => (
            <option key={app.id} value={app.id}>
              {label(app.title || app.appName || app.id)}
            </option>
          ))}
        </select>
        <button type="button" className="ghost" aria-label={t("previousApp")}
          disabled={!apps || apps.index <= 0} onClick={onPreviousApp}>‹</button>
        <span className="page-label">
          {apps?.totalPages ? `${apps.index + 1} / ${apps.totalPages}` : "0 / 0"}
        </span>
        <button type="button" className="ghost" aria-label={t("nextApp")}
          disabled={!apps || apps.index + 1 >= apps.totalPages} onClick={onNextApp}>›</button>
      </div>
      <div className="toolbar-actions">
        <span className="readonly">{t("readonly")}</span>
        <button type="button" className="secondary" onClick={onRefresh}>
          {t("refresh")}
        </button>
      </div>
    </header>
  );
}
