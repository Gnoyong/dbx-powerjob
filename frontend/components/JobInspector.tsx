import { useState, type FormEvent } from "react";
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
  "tag",
  "extra",
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
  advancedRuntimeConfig: [
    {
      name: "taskTrackerBehavior",
      title: "taskTrackerBehavior",
      choices: [
        ["1", "trackerNormal"],
        ["11", "trackerPaddling"],
      ],
    },
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
  busy,
  error,
  onSave,
  onEdit,
  locale,
  t,
}: {
  detail: JobDetail;
  busy: boolean;
  error: TranslationKey | null;
  onSave: (changes: Record<string, unknown>) => void;
  onEdit: () => void;
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

  function submit(event: FormEvent) {
    event.preventDefault();
    const changes: Record<string, unknown> = {};
    for (const field of dirtyFields) {
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
      if (!dirtyFields.some((key) => key.startsWith(field + "."))) continue;
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
    if (dirtyFields.some((field) => field.startsWith("lifeCycle."))) {
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

  return (
    <form
      className="detail-scroll job-edit-form"
      onSubmit={submit}
    >
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
            type="submit"
            disabled={busy}
            title={t("saveJob")}
          >
            <Save
              size={14}
              aria-hidden="true"
            />{" "}
            {t(busy ? "savingJob" : "saveJob")}
          </Button>
        )}
      </div>
      {(validationError || error) && (
        <p
          className="job-edit-error"
          role="alert"
        >
          {t(validationError ?? error!)}
        </p>
      )}
      <table className="inspector-table">
        <tbody>
          {jobFields
            .filter(([field]) => field in detail || field === "lifeCycle")
            .map(([field, title]) => {
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
                    ) : field === "jobParams" ||
                      field === "processorInfo" ||
                      field === "jobDescription" ? (
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
  busy,
  error,
  onSave,
  onEdit,
  locale,
  t,
}: {
  detail: JobDetail | null;
  status: TranslationKey;
  busy: boolean;
  error: TranslationKey | null;
  onSave: (changes: Record<string, unknown>) => void;
  onEdit: () => void;
  locale: Locale;
  t: T;
}) {
  if (!detail)
    return <div className="detail-scroll empty-pane">{t(status)}</div>;
  return (
    <JobForm
      detail={detail}
      busy={busy}
      error={error}
      onSave={onSave}
      onEdit={onEdit}
      locale={locale}
      t={t}
    />
  );
}
