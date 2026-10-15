import { Button } from "./ui/button";
import { NativeSelect, NativeSelectOption } from "./ui/native-select";
import { label } from "../format";
import type { TranslationKey } from "../i18n";
import type { AppInfo, Page } from "../types";
import type { T } from "../uiTypes";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";

export function Toolbar({
  appId,
  apps,
  appsLoading,
  appsStatus,
  onChooseApp,
  onPreviousApp,
  onNextApp,
  onCreateJob,
  createDisabled,
  onRefresh,
  t,
  children,
  showJobControls = true,
  workflowControls,
}: {
  appId: string;
  apps: Page<AppInfo> | null;
  appsLoading: boolean;
  appsStatus: TranslationKey;
  onChooseApp: (appId: string) => void;
  onPreviousApp: () => void;
  onNextApp: () => void;
  onCreateJob: () => void;
  createDisabled: boolean;
  onRefresh: () => void;
  t: T;
  children?: ReactNode;
  showJobControls?: boolean;
  workflowControls?: {
    createLabel: string;
    createDisabled: boolean;
    refreshDisabled: boolean;
    onCreate: () => void;
    onRefresh: () => void;
  };
}) {
  const selectedIndex =
    apps?.data.findIndex((app) => String(app.id) === appId) ?? -1;
  const appNumber =
    apps && selectedIndex >= 0
      ? apps.index * apps.pageSize + selectedIndex + 1
      : 0;
  const hasPreviousApp =
    !!apps && selectedIndex >= 0 && (apps.index > 0 || selectedIndex > 0);
  const hasNextApp =
    !!apps &&
    selectedIndex >= 0 &&
    (apps.index + 1 < apps.totalPages || selectedIndex + 1 < apps.data.length);
  return (
    <header className="toolbar">
      <div className="app-picker">
        <label htmlFor="app-select">{t("app")}</label>
        <NativeSelect
          id="app-select"
          value={appId}
          disabled={!apps?.data.length || appsLoading}
          onChange={(event) => onChooseApp(event.target.value)}
        >
          {!apps?.data.length && (
            <NativeSelectOption value="">{t(appsStatus)}</NativeSelectOption>
          )}
          {apps?.data.map((app) => (
            <NativeSelectOption
              key={app.id}
              value={app.id}
            >
              {label(app.title || app.appName || app.id)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button
          size="xs"
          type="button"
          variant="ghost"
          aria-label={t("previousApp")}
          disabled={appsLoading || !hasPreviousApp}
          onClick={onPreviousApp}
        >
          ‹
        </Button>
        <span className="page-label">
          {`${appNumber} / ${apps?.totalItems ?? 0}`}
        </span>
        <Button
          size="xs"
          type="button"
          variant="ghost"
          aria-label={t("nextApp")}
          disabled={appsLoading || !hasNextApp}
          onClick={onNextApp}
        >
          ›
        </Button>
      </div>
      {showJobControls && (
        <div className="flex gap-1">
          {/* <span className="readonly">{t("readonly")}</span> */}
          <Button
            size="xs"
            type="button"
            disabled={createDisabled}
            onClick={onCreateJob}
          >
            <Plus
              size={14}
              aria-hidden="true"
            />{" "}
            {t("newJob")}
          </Button>
          <Button
            size="xs"
            type="button"
            variant="secondary"
            onClick={onRefresh}
          >
            {t("refresh")}
          </Button>
        </div>
      )}
      {workflowControls && (
        <div className="flex gap-1">
          <Button
            size="xs"
            type="button"
            disabled={workflowControls.createDisabled}
            onClick={workflowControls.onCreate}
          >
            <Plus size={14} aria-hidden="true" /> {workflowControls.createLabel}
          </Button>
          <Button
            size="xs"
            type="button"
            variant="secondary"
            disabled={workflowControls.refreshDisabled}
            onClick={workflowControls.onRefresh}
          >
            {t("refresh")}
          </Button>
        </div>
      )}
      <div className="toolbar-actions">{children}</div>
    </header>
  );
}
