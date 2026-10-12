import { useState } from "react";
import { CalendarDays, RotateCcw, Save, X } from "lucide-react";
import { format } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { jobFields, jobDateLabel, label } from "../format";
import type { Locale, TranslationKey } from "../i18n";
import type { JobDetail } from "../types";
import type { T } from "../uiTypes";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Switch } from "./ui/switch";

const textFields = new Set([
  "jobName",
  "jobDescription",
  "jobParams",
  "timeExpression",
  "processorInfo",
  "designatedWorkers",
  "dispatchStrategyConfig",
]);
const integerFields = new Set([
  "maxInstanceNum",
  "concurrency",
  "instanceTimeLimit",
  "instanceRetryNum",
  "taskRetryNum",
  "maxWorkerCount",
]);
const decimalFields = new Set([
  "minCpuCores",
  "minMemorySpace",
  "minDiskSpace",
]);
const options: Record<string, string[]> = {
  timeExpressionType: [
    "API",
    "CRON",
    "FIXED_RATE",
    "FIXED_DELAY",
    "WORKFLOW",
    "DAILY_TIME_INTERVAL",
  ],
  executeType: ["STANDALONE", "BROADCAST", "MAP_REDUCE", "MAP"],
  processorType: ["BUILT_IN", "EXTERNAL", "SHELL", "PYTHON"],
  dispatchStrategy: ["HEALTH_FIRST", "RANDOM", "SPECIFY"],
};
const scheduleFields = [
  ["timeExpressionType", "timeExpressionType"],
  ["timeExpression", "timeExpression"],
] as const;
const idFields = [
  ["id", "jobId"],
  ["appId", "appId"],
] as const;
const resourceFields = [
  ["minCpuCores", "minCpuCores"],
  ["minMemorySpace", "minMemorySpace"],
  ["minDiskSpace", "minDiskSpace"],
] as const;
const runtimeNumberFields = [
  "maxInstanceNum",
  "concurrency",
  "instanceTimeLimit",
] as const;
const runtimeFields = [
  ...runtimeNumberFields,
  "dispatchStrategy",
  "dispatchStrategyConfig",
] as const;
type ConfigField = {
  name: string;
  title: TranslationKey;
  choices?: [string, TranslationKey][];
  required?: boolean;
};
const configFields: Record<string, ConfigField[]> = {
  alarmConfig: [
    { name: "alertThreshold", title: "alertThreshold", required: true },
    { name: "statisticWindowLen", title: "statisticWindowLen", required: true },
    { name: "silenceWindowLen", title: "silenceWindowLen", required: true },
  ],
  logConfig: [
    {
      name: "type",
      title: "logType",
      choices: [
        ["1", "logOnline"],
        ["2", "logLocal"],
        ["3", "logStdout"],
        ["4", "logLocalOnline"],
        ["999", "logOff"],
      ],
    },
    {
      name: "level",
      title: "logLevel",
      choices: [
        ["1", "levelDebug"],
        ["2", "levelInfo"],
        ["3", "levelWarn"],
        ["4", "levelError"],
        ["99", "levelOff"],
      ],
    },
    { name: "loggerName", title: "loggerName" },
  ],
};

function configObject(
  detail: JobDetail,
  field: string,
): Record<string, unknown> {
  const value = detail[field];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function displayValue(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function cycleDate(value: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function cycleValue(value: unknown, key: "start" | "end"): string {
  if (!value || typeof value !== "object") return "";
  const timestamp = (value as Record<string, unknown>)[key];
  if (!/^\d{13}$/.test(String(timestamp))) return "";
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 23);
}

function timestamp(value: string): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return /^\d{13}$/.test(String(parsed)) ? parsed : NaN;
}

function initialValues(detail: JobDetail): Record<string, string> {
  const initial: Record<string, string> = {};
  for (const [field] of jobFields) {
    if (field in detail && !configFields[field])
      initial[field] = displayValue(detail[field]);
  }
  for (const [field, specs] of Object.entries(configFields)) {
    if (!(field in detail)) continue;
    const config = configObject(detail, field);
    for (const spec of specs)
      initial[field + "." + spec.name] = displayValue(config[spec.name]);
  }
  initial["lifeCycle.start"] = cycleValue(detail.lifeCycle, "start");
  initial["lifeCycle.end"] = cycleValue(detail.lifeCycle, "end");
  return initial;
}

function JobForm({
  detail,
  mode,
  busy,
  error,
  onSave,
  onEdit,
  formId,
  locale,
  t,
}: {
  detail: JobDetail;
  mode: "edit" | "create";
  busy: boolean;
  error: TranslationKey | null;
  onSave: (changes: Record<string, unknown>) => void;
  onEdit: () => void;
  formId?: string;
  locale: Locale;
  t: T;
}) {
  const initial = initialValues(detail);
  const [values, setValues] = useState<Record<string, string>>(() => initial);
  const [validationError, setValidationError] = useState<TranslationKey | null>(
    null,
  );
  const dirtyFields = Object.keys(values).filter(
    (field) => values[field] !== initial[field],
  );
  const setField = (field: string, value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    setValidationError(null);
    onEdit();
  };
  const reset = () => {
    setValues(initial);
    setValidationError(null);
    onEdit();
  };

  function submit() {
    if (
      !values.jobName?.trim() ||
      !values.processorInfo?.trim() ||
      !options.timeExpressionType?.includes(values.timeExpressionType ?? "") ||
      !options.executeType?.includes(values.executeType ?? "") ||
      !options.processorType?.includes(values.processorType ?? "")
    ) {
      setValidationError("invalidJobRequired");
      return;
    }
    const changes: Record<string, unknown> = {};
    const submittedFields =
      mode === "create" ? Object.keys(values) : dirtyFields;
    for (const field of submittedFields) {
      const raw = values[field] ?? "";
      if (field.startsWith("lifeCycle.") || field.includes(".")) continue;
      if (field === "enable") changes.enable = raw === "true";
      else if (integerFields.has(field) || decimalFields.has(field)) {
        if (
          !(integerFields.has(field) ? /^\d+$/ : /^\d+(?:\.\d+)?$/).test(raw)
        ) {
          setValidationError("invalidJobNumber");
          return;
        }
        changes[field] = Number(raw);
      } else changes[field] = raw;
    }
    for (const [field, specs] of Object.entries(configFields)) {
      if (!submittedFields.some((key) => key.startsWith(field + "."))) continue;
      const config = { ...configObject(detail, field) };
      for (const spec of specs) {
        const raw = values[field + "." + spec.name] ?? "";
        if (spec.required && !/^\d+$/.test(raw)) {
          setValidationError("invalidAlarmConfig");
          return;
        }
        if (
          spec.choices &&
          raw !== "" &&
          !spec.choices.some(([value]) => value === raw)
        ) {
          setValidationError("invalidJobNumber");
          return;
        }
        if (spec.name === "loggerName") config[spec.name] = raw;
        else if (raw === "") config[spec.name] = null;
        else if (/^\d+$/.test(raw)) config[spec.name] = Number(raw);
        else {
          setValidationError("invalidJobNumber");
          return;
        }
      }
      changes[field] = config;
    }
    if (submittedFields.some((field) => field.startsWith("lifeCycle."))) {
      const cycle = configObject(detail, "lifeCycle");
      const original = (part: "start" | "end") =>
        cycle[part] == null ? null : Number(cycle[part]);
      const start = dirtyFields.includes("lifeCycle.start")
        ? timestamp(values["lifeCycle.start"] ?? "")
        : original("start");
      const end = dirtyFields.includes("lifeCycle.end")
        ? timestamp(values["lifeCycle.end"] ?? "")
        : original("end");
      if (
        Number.isNaN(start) ||
        Number.isNaN(end) ||
        (start !== null && end !== null && start >= end)
      ) {
        setValidationError("invalidLifeCycle");
        return;
      }
      changes.lifeCycle = { start, end };
    }
    setValidationError(null);
    onSave(changes);
  }

  const from = cycleDate(values["lifeCycle.start"] ?? "");
  const to = cycleDate(values["lifeCycle.end"] ?? "");
  const selected: DateRange = { from, to };
  const chooseRange = (range: DateRange | undefined) => {
    const dateValue = (date: Date | undefined, part: "start" | "end") => {
      if (!date) return "";
      const previous = values["lifeCycle." + part] ?? "";
      return (
        format(date, "yyyy-MM-dd") +
        "T" +
        (previous ? previous.slice(11) : "00:00:00.000")
      );
    };
    setValues((previous) => ({
      ...previous,
      "lifeCycle.start": dateValue(range?.from, "start"),
      "lifeCycle.end": dateValue(range?.to, "end"),
    }));
    setValidationError(null);
    onEdit();
  };
  const dateSummary = [
    from && format(from, "yyyy-MM-dd"),
    to && format(to, "yyyy-MM-dd"),
  ]
    .filter(Boolean)
    .join(" – ");
  const showScheduleRow = scheduleFields.every(([field]) => field in detail);
  const showEnabledInSchedule =
    showScheduleRow && "enable" in detail && typeof detail.enable === "boolean";
  const showResourceRow = resourceFields.every(([field]) => field in detail);
  const showProcessorRow =
    "processorType" in detail && "processorInfo" in detail;
  const showExecuteTypeInExecution =
    showProcessorRow && "executeType" in detail;
  const showWorkerRow =
    "designatedWorkers" in detail && "maxWorkerCount" in detail;
  const showDispatchRow =
    "dispatchStrategy" in detail && "dispatchStrategyConfig" in detail;
  const showRetryRow = "instanceRetryNum" in detail && "taskRetryNum" in detail;
  const showRuntimeRow = runtimeFields.every((field) => field in detail);
  const showTimestampsRow = "gmtCreate" in detail && "gmtModified" in detail;
  const showIdsRow = idFields.every(([field]) => field in detail);
  const executeChoices = options.executeType ?? [];
  const processorChoices = options.processorType ?? [];
  const dispatchChoices = options.dispatchStrategy ?? [];

  return (
    <form
      id={formId}
      className="detail-scroll job-edit-form"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {mode === "edit" && (
        <div className="job-edit-actions">
          <Button
            size="xs"
            variant="secondary"
            type="button"
            disabled={busy || dirtyFields.length === 0}
            title={t("resetJob")}
            onClick={reset}
          >
            <RotateCcw
              size={14}
              aria-hidden="true"
            />{" "}
            {t("resetJob")}
          </Button>
          {dirtyFields.length > 0 && (
            <Button
              size="xs"
              type="button"
              disabled={busy}
              title={t("saveJob")}
              onClick={submit}
            >
              <Save
                size={14}
                aria-hidden="true"
              />{" "}
              {t(busy ? "savingJob" : "saveJob")}
            </Button>
          )}
        </div>
      )}
      {(validationError || error) && (
        <p
          className="job-edit-error"
          role="alert"
        >
          {t(validationError ?? error!)}
        </p>
      )}
      <table className="inspector-table">
        <colgroup>
          <col className="inspector-label-column" />
          <col />
        </colgroup>
        <tbody>
          {jobFields
            .filter(([field]) => field in detail || field === "lifeCycle")
            .map(([field, title]) => {
              if (showIdsRow && field === "appId") return null;
              if (showIdsRow && field === "id") {
                return (
                  <tr key="ids">
                    <td colSpan={2}>
                      <dl className="job-inline-fields job-readonly-fields">
                        {idFields.map(([idField, idTitle]) => (
                          <div key={idField}>
                            <dt>{t(idTitle)}</dt>
                            <dd>{label(detail[idField])}</dd>
                          </div>
                        ))}
                      </dl>
                    </td>
                  </tr>
                );
              }
              if (showEnabledInSchedule && field === "enable") return null;
              if (showScheduleRow && field === "timeExpression") return null;
              if (showScheduleRow && field === "timeExpressionType") {
                return (
                  <tr
                    key="schedule"
                    className="job-schedule-row"
                  >
                    <th scope="row">{t("scheduleConfig")}</th>
                    <td>
                      <div className="job-inline-fields">
                        {showEnabledInSchedule && (
                          <label className="job-schedule-enabled">
                            <span>{t("enabled")}</span>
                            <div className="job-switch-row">
                              <Switch
                                aria-label={t("enabled")}
                                checked={values.enable === "true"}
                                disabled={busy}
                                onCheckedChange={(checked) =>
                                  setField("enable", String(checked))
                                }
                              />
                              <span>
                                {t(
                                  values.enable === "true"
                                    ? "enabled"
                                    : "disabled",
                                )}
                              </span>
                            </div>
                          </label>
                        )}
                        {scheduleFields.map(
                          ([scheduleField, scheduleTitle]) => {
                            const choices = options[scheduleField];
                            return (
                              <label key={scheduleField}>
                                <span>{t(scheduleTitle)}</span>
                                {choices ? (
                                  <select
                                    value={values[scheduleField] ?? ""}
                                    disabled={busy}
                                    onChange={(event) =>
                                      setField(
                                        scheduleField,
                                        event.target.value,
                                      )
                                    }
                                  >
                                    {!choices.includes(
                                      values[scheduleField] ?? "",
                                    ) && (
                                      <option value={values[scheduleField]}>
                                        {values[scheduleField]}
                                      </option>
                                    )}
                                    {choices.map((option) => (
                                      <option
                                        key={option}
                                        value={option}
                                      >
                                        {option}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type="text"
                                    value={values[scheduleField] ?? ""}
                                    maxLength={65536}
                                    disabled={busy}
                                    onChange={(event) =>
                                      setField(
                                        scheduleField,
                                        event.target.value,
                                      )
                                    }
                                  />
                                )}
                              </label>
                            );
                          },
                        )}
                      </div>
                    </td>
                  </tr>
                );
              }
              if (showExecuteTypeInExecution && field === "executeType")
                return null;
              if (showProcessorRow && field === "processorInfo") return null;
              if (showProcessorRow && field === "processorType") {
                return (
                  <tr key="processor">
                    <th scope="row">{t("executionConfig")}</th>
                    <td>
                      <div className="job-inline-fields job-execution-fields">
                        {showExecuteTypeInExecution && (
                          <label>
                            <span>{t("executeType")}</span>
                            <select
                              value={values.executeType ?? ""}
                              disabled={busy}
                              onChange={(event) =>
                                setField("executeType", event.target.value)
                              }
                            >
                              {!executeChoices.includes(
                                values.executeType ?? "",
                              ) && (
                                <option value={values.executeType}>
                                  {values.executeType}
                                </option>
                              )}
                              {executeChoices.map((option) => (
                                <option
                                  key={option}
                                  value={option}
                                >
                                  {option}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <label>
                          <span>{t("processorType")}</span>
                          <select
                            value={values.processorType ?? ""}
                            disabled={busy}
                            onChange={(event) =>
                              setField("processorType", event.target.value)
                            }
                          >
                            {!processorChoices.includes(
                              values.processorType ?? "",
                            ) && (
                              <option value={values.processorType}>
                                {values.processorType}
                              </option>
                            )}
                            {processorChoices.map((option) => (
                              <option
                                key={option}
                                value={option}
                              >
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>{t("processorInfo")}</span>
                          <input
                            type="text"
                            value={values.processorInfo ?? ""}
                            maxLength={65536}
                            disabled={busy}
                            onChange={(event) =>
                              setField("processorInfo", event.target.value)
                            }
                          />
                        </label>
                      </div>
                    </td>
                  </tr>
                );
              }
              if (
                showResourceRow &&
                (field === "minMemorySpace" || field === "minDiskSpace")
              )
                return null;
              if (showResourceRow && field === "minCpuCores") {
                return (
                  <tr key="resources">
                    <th scope="row">{t("machineConfig")}</th>
                    <td>
                      <div className="job-inline-fields job-machine-fields">
                        {resourceFields.map(
                          ([resourceField, resourceTitle]) => (
                            <label key={resourceField}>
                              <span>{t(resourceTitle)}</span>
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={values[resourceField] ?? ""}
                                disabled={busy}
                                onChange={(event) =>
                                  setField(resourceField, event.target.value)
                                }
                              />
                            </label>
                          ),
                        )}
                      </div>
                    </td>
                  </tr>
                );
              }
              if (showWorkerRow && field === "maxWorkerCount") return null;
              if (showWorkerRow && field === "designatedWorkers") {
                return (
                  <tr key="workers">
                    <th scope="row">{t("clusterConfig")}</th>
                    <td>
                      <div className="job-inline-fields">
                        <label>
                          <span>{t("designatedWorkers")}</span>
                          <input
                            type="text"
                            value={values.designatedWorkers ?? ""}
                            maxLength={65536}
                            disabled={busy}
                            onChange={(event) =>
                              setField("designatedWorkers", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          <span>{t("maxWorkerCount")}</span>
                          <input
                            type="number"
                            min={0}
                            step="1"
                            value={values.maxWorkerCount ?? ""}
                            disabled={busy}
                            onChange={(event) =>
                              setField("maxWorkerCount", event.target.value)
                            }
                          />
                        </label>
                      </div>
                    </td>
                  </tr>
                );
              }
              if (
                showRuntimeRow &&
                field !== "maxInstanceNum" &&
                runtimeFields.some((runtimeField) => runtimeField === field)
              )
                return null;
              if (showRuntimeRow && field === "maxInstanceNum") {
                return (
                  <tr key="runtime">
                    <th scope="row">{t("runtimeConfig")}</th>
                    <td>
                      <div className="job-inline-fields job-runtime-fields">
                        {runtimeNumberFields.map((runtimeField) => (
                          <label key={runtimeField}>
                            <span>{t(runtimeField)}</span>
                            <input
                              type="number"
                              min={0}
                              step="1"
                              value={values[runtimeField] ?? ""}
                              disabled={busy}
                              onChange={(event) =>
                                setField(runtimeField, event.target.value)
                              }
                            />
                          </label>
                        ))}
                        <label>
                          <span>{t("dispatchStrategy")}</span>
                          <select
                            value={values.dispatchStrategy ?? ""}
                            disabled={busy}
                            onChange={(event) =>
                              setField("dispatchStrategy", event.target.value)
                            }
                          >
                            {!dispatchChoices.includes(
                              values.dispatchStrategy ?? "",
                            ) && (
                              <option value={values.dispatchStrategy}>
                                {values.dispatchStrategy}
                              </option>
                            )}
                            {dispatchChoices.map((option) => (
                              <option
                                key={option}
                                value={option}
                              >
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>{t("dispatchStrategyConfig")}</span>
                          <input
                            type="text"
                            value={values.dispatchStrategyConfig ?? ""}
                            maxLength={65536}
                            disabled={busy}
                            onChange={(event) =>
                              setField(
                                "dispatchStrategyConfig",
                                event.target.value,
                              )
                            }
                          />
                        </label>
                      </div>
                    </td>
                  </tr>
                );
              }
              if (showDispatchRow && field === "dispatchStrategyConfig")
                return null;
              if (showDispatchRow && field === "dispatchStrategy") {
                return (
                  <tr key="dispatch">
                    <td colSpan={2}>
                      <div className="job-inline-fields job-paired-fields">
                        <label>
                          <span>{t("dispatchStrategy")}</span>
                          <select
                            value={values.dispatchStrategy ?? ""}
                            disabled={busy}
                            onChange={(event) =>
                              setField("dispatchStrategy", event.target.value)
                            }
                          >
                            {!dispatchChoices.includes(
                              values.dispatchStrategy ?? "",
                            ) && (
                              <option value={values.dispatchStrategy}>
                                {values.dispatchStrategy}
                              </option>
                            )}
                            {dispatchChoices.map((option) => (
                              <option
                                key={option}
                                value={option}
                              >
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>{t("dispatchStrategyConfig")}</span>
                          <input
                            type="text"
                            value={values.dispatchStrategyConfig ?? ""}
                            maxLength={65536}
                            disabled={busy}
                            onChange={(event) =>
                              setField(
                                "dispatchStrategyConfig",
                                event.target.value,
                              )
                            }
                          />
                        </label>
                      </div>
                    </td>
                  </tr>
                );
              }
              if (showRetryRow && field === "taskRetryNum") return null;
              if (showRetryRow && field === "instanceRetryNum") {
                return (
                  <tr key="retry">
                    <th scope="row">{t("retryConfig")}</th>
                    <td>
                      <div className="job-inline-fields job-retry-fields">
                        <label>
                          <span>{t("instanceRetryNum")}</span>
                          <input
                            type="number"
                            min={0}
                            step="1"
                            value={values.instanceRetryNum ?? ""}
                            disabled={busy}
                            onChange={(event) =>
                              setField("instanceRetryNum", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          <span>{t("taskRetryNum")}</span>
                          <input
                            type="number"
                            min={0}
                            step="1"
                            value={values.taskRetryNum ?? ""}
                            disabled={busy}
                            onChange={(event) =>
                              setField("taskRetryNum", event.target.value)
                            }
                          />
                        </label>
                      </div>
                    </td>
                  </tr>
                );
              }
              if (showTimestampsRow && field === "gmtModified") return null;
              if (showTimestampsRow && field === "gmtCreate") {
                return (
                  <tr key="timestamps">
                    <td colSpan={2}>
                      <dl className="job-inline-fields job-readonly-fields">
                        {(["gmtCreate", "gmtModified"] as const).map(
                          (timestampField) => (
                            <div key={timestampField}>
                              <dt>{t(timestampField)}</dt>
                              <dd>
                                {jobDateLabel(detail[timestampField], locale)}
                              </dd>
                            </div>
                          ),
                        )}
                      </dl>
                    </td>
                  </tr>
                );
              }
              const value = detail[field];
              const choices = options[field];
              const editable =
                textFields.has(field) ||
                integerFields.has(field) ||
                decimalFields.has(field) ||
                !!choices;
              const multiline =
                (typeof value === "object" && value !== null) ||
                (typeof value === "string" &&
                  (value.length > 80 || value.includes("\n")));
              return (
                <tr key={field}>
                  <th scope="row">{t(title)}</th>
                  <td>
                    {field === "enable" && typeof value === "boolean" ? (
                      <div className="job-switch-row">
                        <Switch
                          aria-label={t("enabled")}
                          checked={values.enable === "true"}
                          disabled={busy}
                          onCheckedChange={(checked) =>
                            setField("enable", String(checked))
                          }
                        />
                        <span>
                          {t(values.enable === "true" ? "enabled" : "disabled")}
                        </span>
                      </div>
                    ) : field === "lifeCycle" ? (
                      <div className="job-life-cycle">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              size="sm"
                              variant="secondary"
                              type="button"
                              disabled={busy}
                              className="job-range-trigger font-normal"
                            >
                              <CalendarDays
                                size={15}
                                aria-hidden="true"
                              />
                              {dateSummary || t("chooseDateRange")}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="job-range-popover"
                            align="start"
                          >
                            <Calendar
                              className="font-normal"
                              mode="range"
                              selected={selected}
                              onSelect={chooseRange}
                              resetOnSelect
                              defaultMonth={from ?? to ?? new Date()}
                              numberOfMonths={window.innerWidth > 900 ? 2 : 1}
                              locale={locale === "zh-CN" ? zhCN : enUS}
                              startMonth={new Date(2001, 0)}
                              endMonth={new Date(2286, 11)}
                            />
                            <Button
                              size="xs"
                              type="button"
                              variant="ghost"
                              onClick={() => chooseRange(undefined)}
                            >
                              {t("clearDateRange")}
                            </Button>
                          </PopoverContent>
                        </Popover>
                        <div className="job-life-cycle-times">
                          {(["start", "end"] as const).map((part) => (
                            <label key={part}>
                              <span>
                                {t(
                                  part === "start"
                                    ? "lifeCycleStart"
                                    : "lifeCycleEnd",
                                )}
                              </span>
                              <div className="job-time-input">
                                <Input
                                  type="time"
                                  step="1"
                                  disabled={
                                    busy || !values["lifeCycle." + part]
                                  }
                                  className="h-7"
                                  value={
                                    values["lifeCycle." + part]?.slice(
                                      11,
                                      19,
                                    ) ?? ""
                                  }
                                  onChange={(event) => {
                                    const previous =
                                      values["lifeCycle." + part] ?? "";
                                    setField(
                                      "lifeCycle." + part,
                                      previous.slice(0, 10) +
                                        "T" +
                                        event.target.value +
                                        previous.slice(19),
                                    );
                                  }}
                                />
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  type="button"
                                  disabled={
                                    busy || !values["lifeCycle." + part]
                                  }
                                  title={t("clearDate")}
                                  aria-label={t("clearDate")}
                                  onClick={() =>
                                    setField("lifeCycle." + part, "")
                                  }
                                >
                                  <X size={14} />
                                </Button>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : configFields[field] ? (
                      <div className="job-config-fields">
                        {configFields[field].map((spec) => {
                          const key = field + "." + spec.name;
                          return (
                            <label key={key}>
                              <span>{t(spec.title)}</span>
                              {spec.choices ? (
                                <select
                                  value={values[key] ?? ""}
                                  disabled={busy}
                                  onChange={(event) =>
                                    setField(key, event.target.value)
                                  }
                                >
                                  <option value="">{t("defaultOption")}</option>
                                  {!spec.choices.some(
                                    ([option]) => option === values[key],
                                  ) &&
                                    values[key] && (
                                      <option value={values[key]}>
                                        {values[key]}
                                      </option>
                                    )}
                                  {spec.choices.map(([option, caption]) => (
                                    <option
                                      key={option}
                                      value={option}
                                    >
                                      {t(caption)}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type={
                                    spec.name === "loggerName"
                                      ? "text"
                                      : "number"
                                  }
                                  min={
                                    spec.name === "loggerName" ? undefined : 0
                                  }
                                  step={
                                    spec.name === "loggerName" ? undefined : 1
                                  }
                                  value={values[key] ?? ""}
                                  disabled={busy}
                                  onChange={(event) =>
                                    setField(key, event.target.value)
                                  }
                                />
                              )}
                            </label>
                          );
                        })}
                      </div>
                    ) : choices ? (
                      <select
                        aria-label={t(title)}
                        value={values[field] ?? ""}
                        disabled={busy}
                        onChange={(event) =>
                          setField(field, event.target.value)
                        }
                      >
                        {!choices.includes(values[field] ?? "") && (
                          <option value={values[field]}>{values[field]}</option>
                        )}
                        {choices.map((option) => (
                          <option
                            key={option}
                            value={option}
                          >
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : field === "jobParams" || field === "jobDescription" ? (
                      <textarea
                        aria-label={t(title)}
                        value={values[field] ?? ""}
                        maxLength={65536}
                        disabled={busy}
                        onChange={(event) =>
                          setField(field, event.target.value)
                        }
                      />
                    ) : editable ? (
                      <input
                        aria-label={t(title)}
                        type={
                          integerFields.has(field) || decimalFields.has(field)
                            ? "number"
                            : "text"
                        }
                        min={
                          integerFields.has(field) || decimalFields.has(field)
                            ? 0
                            : undefined
                        }
                        step={
                          decimalFields.has(field)
                            ? "any"
                            : integerFields.has(field)
                              ? "1"
                              : undefined
                        }
                        value={values[field] ?? ""}
                        maxLength={65536}
                        disabled={busy}
                        onChange={(event) =>
                          setField(field, event.target.value)
                        }
                      />
                    ) : field === "gmtCreate" || field === "gmtModified" ? (
                      jobDateLabel(value, locale)
                    ) : multiline ? (
                      <pre>
                        {typeof value === "object"
                          ? JSON.stringify(value, null, 2)
                          : String(value)}
                      </pre>
                    ) : typeof value === "boolean" ? (
                      t(value ? "yes" : "no")
                    ) : (
                      label(value)
                    )}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </form>
  );
}

export function JobInspector({
  detail,
  status,
  mode = "edit",
  busy,
  error,
  onSave,
  onEdit,
  formId,
  locale,
  t,
}: {
  detail: JobDetail | null;
  status: TranslationKey;
  mode?: "edit" | "create";
  busy: boolean;
  error: TranslationKey | null;
  onSave: (changes: Record<string, unknown>) => void;
  onEdit: () => void;
  formId?: string;
  locale: Locale;
  t: T;
}) {
  if (!detail)
    return <div className="detail-scroll empty-pane">{t(status)}</div>;
  return (
    <JobForm
      detail={detail}
      mode={mode}
      busy={busy}
      error={error}
      onSave={onSave}
      onEdit={onEdit}
      formId={formId}
      locale={locale}
      t={t}
    />
  );
}
