import type { FormEvent } from "react";
import { dateLabel, label, statusLabel } from "../format";
import type { Locale, TranslationKey } from "../i18n";
import type { Instance, InstanceType, Page } from "../types";
import type { T } from "../uiTypes";
import { LogViewer } from "./LogViewer";
import { Pager } from "./Pager";

export function RunsPane({
  visible, instances, loading, status, draftInstanceId, draftType, filterType,
  selectedInstanceId, locale, connectionId, appId, selectedJobId,
  onDraftInstanceIdChange, onDraftTypeChange, onSearch, onChooseInstance,
  onOpenInstance, onPage, t,
}: {
  visible: boolean;
  instances: Page<Instance> | null;
  loading: boolean;
  status: TranslationKey;
  draftInstanceId: string;
  draftType: InstanceType;
  filterType: InstanceType;
  selectedInstanceId: string;
  locale: Locale;
  connectionId: string;
  appId: string;
  selectedJobId: string;
  onDraftInstanceIdChange: (value: string) => void;
  onDraftTypeChange: (value: InstanceType) => void;
  onSearch: (event: FormEvent) => void;
  onChooseInstance: (instance: Instance) => void;
  onOpenInstance: (instance: Instance) => void;
  onPage: (index: number) => void;
  t: T;
}) {
  return (
    <section className="runs-view" aria-label={t("runsAndLogs")} hidden={!visible}>
      <div className="instances-pane">
        <div className="sub-pane-bar">
          <strong>{t("jobInstances")}</strong>
          <form className="instance-filter" onSubmit={onSearch}>
            <label htmlFor="instance-id" className="sr-only">{t("instanceId")}</label>
            <input id="instance-id" inputMode="numeric" placeholder={t("instanceId")}
              value={draftInstanceId}
              onChange={(event) => onDraftInstanceIdChange(event.target.value)} />
            <label htmlFor="instance-type" className="sr-only">{t("instanceType")}</label>
            <select id="instance-type" value={draftType}
              onChange={(event) => onDraftTypeChange(event.target.value as InstanceType)}>
              <option value="NORMAL">{t("normalJob")}</option>
              <option value="WORKFLOW">{t("workflow")}</option>
            </select>
            <button type="submit" className="secondary">{t("search")}</button>
          </form>
        </div>
        <div className="instances-table-scroll">
          <table className="instances-table">
            <thead><tr>
              <th>{t("instanceId")}</th>
              <th>{t("status")}</th>
              <th>{t("triggeredAt")}</th>
              <th>{t("finishedAt")}</th>
              <th />
            </tr></thead>
            <tbody>
              {loading || !instances?.data.length ? (
                <tr><td colSpan={5} className="instance-empty">{t(status)}</td></tr>
              ) : instances.data.map((instance) => (
                <tr key={instance.instanceId} tabIndex={0}
                  className={String(instance.instanceId) === selectedInstanceId ? "selected" : ""}
                  aria-selected={String(instance.instanceId) === selectedInstanceId}
                  onClick={() => onChooseInstance(instance)}
                  onKeyDown={(event) => {
                    if (event.target === event.currentTarget &&
                        (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      onChooseInstance(instance);
                    }
                  }}>
                  <td>{label(instance.instanceId)}</td>
                  <td>{statusLabel(instance.status, filterType, locale)}</td>
                  <td>{dateLabel(instance.actualTriggerTime, locale)}</td>
                  <td>{dateLabel(instance.finishedTime, locale)}</td>
                  <td><button type="button" className="ghost" onClick={(event) => {
                    event.stopPropagation();
                    onOpenInstance(instance);
                  }}>{t("detail")}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={instances} onPage={onPage} t={t} />
      </div>
      <LogViewer key={`${appId}:${selectedJobId}:${selectedInstanceId}`}
        connectionId={connectionId} appId={appId}
        instanceId={selectedInstanceId} t={t} />
    </section>
  );
}
