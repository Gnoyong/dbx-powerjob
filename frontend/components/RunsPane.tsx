import { useRef, useState } from "react";
import type { PanelSize } from "react-resizable-panels";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { NativeSelect, NativeSelectOption } from "./ui/native-select";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "./ui/resizable";
import {
  dateLabel,
  instanceStatusOptions,
  isFailedNormalInstance,
  label,
  statusLabel,
} from "../format";
import type { Locale, TranslationKey } from "../i18n";
import type { Instance, InstanceType, Page } from "../types";
import type { T } from "../uiTypes";
import { LogViewer } from "./LogViewer";
import { Pager } from "./Pager";
import { InstanceStatusBadge } from "./InstanceStatusBadge";

export function RunsPane({
  visible,
  instances,
  loading,
  status,
  draftInstanceId,
  draftType,
  draftStatus,
  filterType,
  selectedInstanceId,
  locale,
  connectionId,
  appId,
  selectedJobId,
  onDraftInstanceIdChange,
  onDraftTypeChange,
  onDraftStatusChange,
  onSearch,
  onChooseInstance,
  onOpenInstance,
  onRetryInstance,
  busy,
  logRefresh,
  onPage,
  t,
}: {
  visible: boolean;
  instances: Page<Instance> | null;
  loading: boolean;
  status: TranslationKey;
  draftInstanceId: string;
  draftType: InstanceType;
  draftStatus: string;
  filterType: InstanceType;
  selectedInstanceId: string;
  locale: Locale;
  connectionId: string;
  appId: string;
  selectedJobId: string;
  onDraftInstanceIdChange: (value: string) => void;
  onDraftTypeChange: (value: InstanceType) => void;
  onDraftStatusChange: (value: string) => void;
  onSearch: () => void;
  onChooseInstance: (instance: Instance) => void;
  onOpenInstance: (instance: Instance) => void;
  onRetryInstance: (instance: Instance) => void;
  busy: boolean;
  logRefresh: number;
  onPage: (index: number) => void;
  t: T;
}) {
  const storageKey = "local.powerjob.readonly.logs-pane-height";
  const [savedHeight] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const value = raw === null ? NaN : Number(raw);
      return Number.isFinite(value) && value >= 150 ? value : null;
    } catch {
      return null;
    }
  });
  const logsHeight = useRef(savedHeight ?? 0);

  return (
    <section
      className="runs-view"
      aria-label={t("runsAndLogs")}
      hidden={!visible}
    >
      <ResizablePanelGroup
        id="runs-panel-group"
        className="runs-panel-group"
        orientation="vertical"
        onLayoutChanged={(_layout, meta) => {
          if (!meta.isUserInteraction || logsHeight.current <= 0) return;
          try {
            localStorage.setItem(
              storageKey,
              String(Math.round(logsHeight.current)),
            );
          } catch {
            /* sandboxed host */
          }
        }}
      >
        <ResizablePanel
          id="instances-panel"
          minSize={170}
          className="runs-panel"
        >
          <div className="instances-pane">
            <div className="sub-pane-bar">
              <strong>{t("jobInstances")}</strong>
              <div
                className="instance-filter"
                role="search"
              >
                <label
                  htmlFor="instance-id"
                  className="sr-only"
                >
                  {t("instanceId")}
                </label>
                <Input
                  className="h-7"
                  id="instance-id"
                  inputMode="numeric"
                  placeholder={t("instanceId")}
                  value={draftInstanceId}
                  onChange={(event) =>
                    onDraftInstanceIdChange(event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onSearch();
                    }
                  }}
                />
                <label
                  htmlFor="instance-type"
                  className="sr-only"
                >
                  {t("instanceType")}
                </label>
                <NativeSelect
                  id="instance-type"
                  value={draftType}
                  onChange={(event) =>
                    onDraftTypeChange(event.target.value as InstanceType)
                  }
                >
                  <NativeSelectOption value="NORMAL">
                    {t("normalJob")}
                  </NativeSelectOption>
                  <NativeSelectOption value="WORKFLOW">
                    {t("workflow")}
                  </NativeSelectOption>
                </NativeSelect>
                <label
                  htmlFor="instance-status"
                  className="sr-only"
                >
                  {t("status")}
                </label>
                <NativeSelect
                  id="instance-status"
                  aria-label={t("status")}
                  value={draftStatus}
                  onChange={(event) => onDraftStatusChange(event.target.value)}
                >
                  <NativeSelectOption value="">
                    {t("allStatuses")}
                  </NativeSelectOption>
                  {instanceStatusOptions(draftType).map((value) => (
                    <NativeSelectOption
                      key={value}
                      value={value}
                    >
                      {statusLabel(value, draftType, locale)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <Button
                  size="xs"
                  type="button"
                  variant="secondary"
                  onClick={onSearch}
                >
                  {t("search")}
                </Button>
              </div>
            </div>
            <div className="instances-table-scroll">
              <table className="instances-table">
                <thead>
                  <tr>
                    <th>{t("instanceId")}</th>
                    <th>{t("status")}</th>
                    <th>{t("triggeredAt")}</th>
                    <th>{t("finishedAt")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {loading || !instances?.data.length ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="instance-empty"
                      >
                        {t(status)}
                      </td>
                    </tr>
                  ) : (
                    instances.data.map((instance) => (
                      <tr
                        key={instance.instanceId}
                        tabIndex={0}
                        className={
                          String(instance.instanceId) === selectedInstanceId
                            ? "selected"
                            : ""
                        }
                        aria-selected={
                          String(instance.instanceId) === selectedInstanceId
                        }
                        onClick={() => onChooseInstance(instance)}
                        onKeyDown={(event) => {
                          if (
                            event.target === event.currentTarget &&
                            (event.key === "Enter" || event.key === " ")
                          ) {
                            event.preventDefault();
                            onChooseInstance(instance);
                          }
                        }}
                      >
                        <td>{label(instance.instanceId)}</td>
                        <td>
                          <InstanceStatusBadge
                            value={instance.status}
                            type={filterType}
                            locale={locale}
                          />
                        </td>
                        <td>{dateLabel(instance.actualTriggerTime, locale)}</td>
                        <td>{dateLabel(instance.finishedTime, locale)}</td>
                        <td className="instance-actions">
                          {isFailedNormalInstance(
                            instance.status,
                            filterType,
                          ) && (
                            <Button
                              size="xs"
                              type="button"
                              variant="secondary"
                              disabled={busy}
                              onClick={(event) => {
                                event.stopPropagation();
                                onRetryInstance(instance);
                              }}
                            >
                              {t("retryFailed")}
                            </Button>
                          )}
                          <Button
                            size="xs"
                            type="button"
                            variant="ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenInstance(instance);
                            }}
                          >
                            {t("detail")}
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pager
              page={instances}
              onPage={onPage}
              t={t}
            />
          </div>
        </ResizablePanel>
        <ResizableHandle
          withHandle
          aria-label={t("resizeLogsPane")}
        />
        <ResizablePanel
          id="logs-panel"
          className="runs-panel"
          minSize={150}
          defaultSize={savedHeight ?? "58%"}
          groupResizeBehavior="preserve-pixel-size"
          onResize={(size: PanelSize) => {
            logsHeight.current = size.inPixels;
          }}
        >
          <LogViewer
            key={`${appId}:${selectedJobId}:${selectedInstanceId}:${logRefresh}`}
            connectionId={connectionId}
            appId={appId}
            instanceId={selectedInstanceId}
            t={t}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </section>
  );
}
