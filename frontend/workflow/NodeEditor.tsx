import { useEffect, useState } from "react";
import { invoke } from "../host";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import type { Locale } from "../i18n";
import type { DraftNode } from "./types";
import { workflowText } from "./i18n";

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
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (node.nodeType === 2) return;
    let active = true;
    setLoading(true);
    setError("");
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
  }, [connectionId, appId, node.nodeType, index, query]);
  return (
    <fieldset disabled={disabled} className="wf-fieldset">
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
      {node.nodeType !== 2 && (
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
                  setIndex(0);
                  setQuery(keyword);
                }
              }}
            />
            <Button
              type="button"
              size="xs"
              variant="secondary"
              onClick={() => {
                setIndex(0);
                setQuery(keyword);
              }}
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
                <NativeSelectOption key={r.id} value={r.id}>
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
          {error && <p role="alert">{error}</p>}
        </>
      )}
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
        <Button type="button" size="xs" variant="secondary" onClick={onDelete}>
          {w("removeNode")}
        </Button>
      </div>
    </fieldset>
  );
}
