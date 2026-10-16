import { useEffect, useState } from "react";
import { invoke } from "../host";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import type { Locale } from "../i18n";
import type { DraftNode } from "./types";
import { workflowText } from "./i18n";
import { useWorkflowNotice } from "./useWorkflowNotice";

export function NodeEditor({
  node,
  connectionId,
  appId,
  locale,
  disabled,
  onChange,
  onDelete,
  onDuplicate,
}: {
  node: DraftNode;
  connectionId: string;
  appId: string;
  locale: Locale;
  disabled: boolean;
  onChange: (node: DraftNode) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const w = workflowText(locale);
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  useWorkflowNotice(error);
  const [loading, setLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    setPickerOpen(false);
  }, [connectionId, appId, node.key, disabled]);
  useEffect(() => {
    setKeyword("");
    setQuery("");
    setIndex(0);
    setOptions([]);
    setTotal(0);
    setError("");
  }, [connectionId, appId]);
  useEffect(() => {
    if (node.nodeType === 2 || (node.nodeType === 1 && !pickerOpen)) return;
    let active = true;
    setLoading(true);
    setError("");
    setOptions([]);
    setTotal(0);
    const request =
      node.nodeType === 3
        ? invoke(connectionId, "powerjob/workflows", {
            appId,
            index,
            pageSize: 20,
            keyword: query,
          }).then((p) => ({
            data: p.data.map((r) => ({ id: r.id, name: r.wfName })),
            pages: p.totalPages,
          }))
        : invoke(connectionId, "powerjob/jobs", {
            appId,
            index,
            pageSize: 20,
            keyword: query,
          }).then((p) => ({
            data: p.data.map((r) => ({ id: r.id, name: r.jobName ?? r.id })),
            pages: p.totalPages,
          }));
    void request
      .then((p) => {
        if (active) {
          setOptions(p.data);
          setTotal(p.pages);
        }
      })
      .catch((e) => {
        if (active) setError(String(e.message ?? e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [connectionId, appId, node.nodeType, index, query, pickerOpen, refresh]);
  function search() {
    setIndex(0);
    const next = keyword.trim();
    if (next === query && index === 0) setRefresh((value) => value + 1);
    else setQuery(next);
  }
  return (
    <>
      <fieldset
        disabled={disabled}
        className="wf-fieldset"
      >
        <legend>
          {w(
            node.nodeType === 2
              ? "decision"
              : node.nodeType === 3
                ? "nested"
                : "task",
          )}
        </legend>
        <label>
          {w("alias")}
          <Input
            value={node.nodeName}
            onChange={(e) => onChange({ ...node, nodeName: e.target.value })}
          />
        </label>
        {node.nodeType !== 2 &&
          (node.nodeType === 1 ? (
            <div className="flex flex-col gap-[3px]">
              <span>{w("reference")}</span>
              <div className="wf-inline">
                <span data-testid="selected-job-reference" className="min-w-0 flex-1 truncate">
                  {node.jobId
                    ? `${options.find((r) => r.id === node.jobId)?.name ?? node.jobId} · #${node.jobId}`
                    : "—"}
                </span>
                <Button
                  type="button"
                  size="xs"
                  variant="secondary"
                  onClick={() => setPickerOpen(true)}
                >
                  {w("chooseJob")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="wf-inline">
                <Input
                  aria-label={w("referenceSearch")}
                  placeholder={w("referenceSearch")}
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      search();
                    }
                  }}
                />
                <Button
                  type="button"
                  size="xs"
                  variant="secondary"
                  onClick={search}
                >
                  {w("search")}
                </Button>
              </div>
              <label>
                {w("reference")}
                <NativeSelect
                  value={node.jobId ?? ""}
                  disabled={loading}
                  onChange={(e) => {
                    const ref = options.find((r) => r.id === e.target.value);
                    onChange({
                      ...node,
                      jobId: e.target.value,
                      nodeName: node.nodeName || ref?.name || "",
                    });
                  }}
                >
                  <NativeSelectOption value="">—</NativeSelectOption>
                  {node.jobId && !options.some((r) => r.id === node.jobId) && (
                    <NativeSelectOption value={node.jobId}>
                      #{node.jobId}
                    </NativeSelectOption>
                  )}
                  {options.map((r) => (
                    <NativeSelectOption
                      key={r.id}
                      value={r.id}
                    >
                      {r.name} · #{r.id}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
              <div className="wf-inline">
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={loading || index === 0}
                  onClick={() => setIndex((i) => i - 1)}
                >
                  {w("previous")}
                </Button>
                <span>
                  {index + 1} / {Math.max(1, total)}
                </span>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={loading || index + 1 >= total}
                  onClick={() => setIndex((i) => i + 1)}
                >
                  {w("next")}
                </Button>
              </div>
            </>
          ))}
        <label>
          {w(node.nodeType === 2 ? "script" : "params")}
          <textarea
            rows={7}
            spellCheck={false}
            value={node.nodeParams}
            onChange={(e) => onChange({ ...node, nodeParams: e.target.value })}
          />
        </label>
        <label className="wf-check">
          <input
            type="checkbox"
            checked={node.enable}
            onChange={(e) => onChange({ ...node, enable: e.target.checked })}
          />
          {w("enabled")}
        </label>
        <label className="wf-check">
          <input
            type="checkbox"
            checked={node.skipWhenFailed}
            onChange={(e) =>
              onChange({ ...node, skipWhenFailed: e.target.checked })
            }
          />
          {w("skip")}
        </label>
        <div className="wf-inline">
          <Button
            type="button"
            size="xs"
            variant="secondary"
            onClick={onDuplicate}
          >
            {w("duplicate")}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="secondary"
            onClick={onDelete}
          >
            {w("removeNode")}
          </Button>
        </div>
      </fieldset>
      {node.nodeType === 1 && (
        <Dialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
        >
          <DialogContent className="flex flex-col gap-2.5 text-xs">
            <DialogTitle className="text-sm font-semibold">{w("chooseJob")}</DialogTitle>
            <p className="m-0 text-xs text-[var(--color-muted-foreground,#677282)]">
              {w("chooseJobHint")}
            </p>
            <div
              className="flex items-center gap-2 [&_input]:min-w-0 [&_input]:flex-1"
              role="search"
            >
              <Input
                type="search"
                aria-label={w("searchJobs")}
                placeholder={w("searchJobs")}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    search();
                  }
                }}
              />
              <Button
                type="button"
                size="xs"
                variant="secondary"
                onClick={search}
              >
                {w("search")}
              </Button>
            </div>
            {error && (
              <p
                role="alert"
                className="m-0 text-[var(--color-destructive,#bd4444)]"
              >
                {error}
              </p>
            )}
            <div
              className="grid min-h-40 max-h-[50vh] grid-cols-2 content-start gap-x-2 gap-y-1 overflow-auto [&_p]:col-span-2 [&_p]:m-0"
              role="list"
              aria-label={w("searchJobs")}
            >
              {loading ? (
                <p>{w("loading")}</p>
              ) : options.length ? (
                options.map((job) => (
                  <div
                    role="listitem"
                    key={job.id}
                    className="min-w-0"
                  >
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      className="min-w-0 w-full justify-between gap-3 text-left text-xs"
                      title={`${job.name} · #${job.id}`}
                      aria-pressed={node.jobId === job.id}
                      disabled={disabled}
                      onClick={() => {
                        if (disabled) return;
                        onChange({
                          ...node,
                          jobId: job.id,
                          nodeName: node.nodeName || job.name,
                        });
                        setPickerOpen(false);
                      }}
                    >
                      <span className="min-w-0 truncate font-semibold">{job.name}</span>
                      <span className="shrink-0 text-[11px] text-[var(--color-muted-foreground,#677282)]">#{job.id}</span>
                    </Button>
                  </div>
                ))
              ) : !error ? (
                <p>{w("empty")}</p>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="wf-inline">
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={loading || index === 0}
                  onClick={() => setIndex((i) => i - 1)}
                >
                  {w("previous")}
                </Button>
                <span className="text-[11px] text-[var(--color-muted-foreground,#677282)]">
                  {total ? `${index + 1} / ${total}` : "0 / 0"}
                </span>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={loading || index + 1 >= total}
                  onClick={() => setIndex((i) => i + 1)}
                >
                  {w("next")}
                </Button>
              </div>
              <Button
                type="button"
                size="xs"
                variant="secondary"
                onClick={() => setPickerOpen(false)}
              >
                {w("cancel")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
