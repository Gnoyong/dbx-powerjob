import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "../host";
import { statusLabel, statusTone } from "../format";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import { LogViewer } from "../components/LogViewer";
import { InstanceDialog } from "../components/InstanceDialog";
import { ConfirmActionDialog } from "../components/ConfirmActionDialog";
import { Pager } from "../components/Pager";
import type { Locale } from "../i18n";
import type { T } from "../uiTypes";
import type { Page } from "../types";
import { workflowText } from "./i18n";
import { WorkflowCanvas } from "./WorkflowCanvas";
import { canMarkSuccess, runtimeDraft } from "./model";
import type { WorkflowInstance } from "./types";

export function WorkflowInstances({
  connectionId,
  appId,
  locale,
  t,
  readOnly,
  initialWorkflowId = "",
  initialInstanceId = "",
}: {
  connectionId: string;
  appId: string;
  locale: Locale;
  t: T;
  readOnly: boolean;
  initialWorkflowId?: string;
  initialInstanceId?: string;
}) {
  const w = workflowText(locale);
  const [workflowId, setWorkflowId] = useState(initialWorkflowId);
  const [instanceId, setInstanceId] = useState(initialInstanceId);
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState({
    workflowId: initialWorkflowId,
    wfInstanceId: initialInstanceId,
    status: "",
  });
  const [index, setIndex] = useState(0);
  const [page, setPage] = useState<Page<WorkflowInstance> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState(initialInstanceId);
  const [detail, setDetail] = useState<WorkflowInstance | null>(null);
  const [nodeKey, setNodeKey] = useState("");
  const [updated, setUpdated] = useState("");
  const [detailError, setDetailError] = useState("");
  const [stack, setStack] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState<
    "stop" | "retry" | "markSuccess" | null
  >(null);
  const [busy, setBusy] = useState(false);
  const actionPending = useRef(false);
  const [actionMessage, setActionMessage] = useState("");
  const [showTask, setShowTask] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true,
      inFlight = false;
    setLoading(true);
    setError("");
    async function load() {
      if (!active || inFlight) return;
      inFlight = true;
      try {
        const value = await invoke(connectionId, "powerjob/workflowInstances", {
          appId,
          index,
          pageSize: 20,
          ...filter,
        });
        if (active) {
          setPage(value);
          setError("");
        }
      } catch (e) {
        if (active) setError(String(e));
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    }
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState !== "hidden") void load();
    }, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [connectionId, appId, index, filter, refresh]);
  useEffect(() => {
    if (!selected) return;
    let active = true,
      inFlight = false,
      finished = false;
    async function load() {
      if (!active || inFlight) return;
      inFlight = true;
      try {
        const value = await invoke(connectionId, "powerjob/workflowInstance", {
          appId,
          wfInstanceId: selected,
        });
        if (active) {
          setDetail(value);
          setDetailError("");
          setUpdated(new Date().toLocaleTimeString(locale));
          finished = value.status !== 1 && value.status !== 2;
        }
      } catch (e) {
        if (active) setDetailError(String(e));
      } finally {
        inFlight = false;
      }
    }
    void load();
    const timer = setInterval(() => {
      if (!finished && document.visibilityState !== "hidden") void load();
    }, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [connectionId, appId, selected, refresh, locale]);
  function select(id: string) {
    setSelected(id);
    setDetail(null);
    setNodeKey("");
    setConfirmation(null);
    setShowTask(false);
    setActionMessage("");
    setDetailError("");
  }
  const graph = useMemo(() => (detail ? runtimeDraft(detail) : null), [detail]);
  const node = detail?.peworkflowDAG?.nodes.find((n) => n.nodeId === nodeKey);
  async function performAction() {
    if (!detail || !confirmation || actionPending.current || readOnly) return;
    const target = confirmation;
    const id = detail.wfInstanceId;
    const targetNode = nodeKey;
    actionPending.current = true;
    setBusy(true);
    setActionMessage("");
    try {
      const method =
        target === "stop"
          ? "powerjob/stopWorkflowInstance"
          : target === "retry"
            ? "powerjob/retryWorkflowInstance"
            : "powerjob/markWorkflowNodeSuccess";
      const result = await invoke(connectionId, method, {
        appId,
        wfInstanceId: id,
        nodeId: targetNode,
      });
      if (mounted.current) {
        setConfirmation(null);
        setActionMessage(
          w(result.verified === false ? "unconfirmed" : "requested"),
        );
        if (result.instance) setDetail(result.instance);
        setRefresh((n) => n + 1);
      }
    } catch (e) {
      if (mounted.current) setActionMessage(String(e));
    } finally {
      actionPending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className="wf-instances">
      <div className="wf-inline wf-filters">
        <Input
          aria-label={w("wfId")}
          placeholder={w("wfId")}
          inputMode="numeric"
          value={workflowId}
          onChange={(e) => setWorkflowId(e.target.value)}
        />
        <Input
          aria-label={w("instanceId")}
          placeholder={w("instanceId")}
          inputMode="numeric"
          value={instanceId}
          onChange={(e) => setInstanceId(e.target.value)}
        />
        <NativeSelect
          aria-label={w("status")}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <NativeSelectOption value="">{t("allStatuses")}</NativeSelectOption>
          {["WAITING", "RUNNING", "FAILED", "SUCCEED", "STOPPED"].map((s) => (
            <NativeSelectOption key={s} value={s}>
              {statusLabel(s, "WORKFLOW_INSTANCE", locale)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button
          type="button"
          size="xs"
          variant="secondary"
          onClick={() => {
            setIndex(0);
            setFilter({ workflowId, wfInstanceId: instanceId, status });
            setRefresh((n) => n + 1);
          }}
        >
          {w("search")}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => setRefresh((n) => n + 1)}
        >
          {w("refresh")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="wf-feedback">
          {error}
        </p>
      )}
      <div className="wf-instance-list">
        <table className="instances-table">
          <thead>
            <tr>
              <th>{w("instanceId")}</th>
              <th>{w("name")}</th>
              <th>{w("status")}</th>
              <th>{w("triggered")}</th>
              <th>{w("finished")}</th>
            </tr>
          </thead>
          <tbody>
            {!page?.data.length ? (
              <tr>
                <td colSpan={5}>{w(loading ? "loading" : "empty")}</td>
              </tr>
            ) : (
              page.data.map((row) => (
                <tr
                  key={row.wfInstanceId}
                  tabIndex={0}
                  aria-selected={selected === row.wfInstanceId}
                  className={selected === row.wfInstanceId ? "selected" : ""}
                  onClick={() => {
                    if (!busy) {
                      setStack([]);
                      select(row.wfInstanceId);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (
                      e.target === e.currentTarget &&
                      (e.key === "Enter" || e.key === " ")
                    ) {
                      e.preventDefault();
                      if (!busy) {
                        setStack([]);
                        select(row.wfInstanceId);
                      }
                    }
                  }}
                >
                  <td>{row.wfInstanceId}</td>
                  <td>
                    {row.workflowName} · #{row.workflowId}
                  </td>
                  <td>
                    <span
                      className={`wf-status wf-status-${statusTone(row.status, "WORKFLOW_INSTANCE")}`}
                    >
                      {statusLabel(row.status, "WORKFLOW_INSTANCE", locale)}
                    </span>
                  </td>
                  <td>{row.actualTriggerTime}</td>
                  <td>{row.finishedTime}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pager page={page} onPage={setIndex} t={t} />
      {detailError && (
        <p role="alert" className="wf-feedback">
          {detailError}
        </p>
      )}
      {actionMessage && (
        <p role="status" className="wf-feedback">
          {actionMessage}
        </p>
      )}
      {!detail || !graph ? (
        <p className="wf-empty">{w(selected ? "loading" : "selectInstance")}</p>
      ) : (
        <>
          <div className="wf-inline wf-instance-actions">
            <strong>
              #{detail.wfInstanceId} ·{" "}
              {statusLabel(detail.status, "WORKFLOW_INSTANCE", locale)}
            </strong>
            <span>
              {w("lastUpdated")}: {updated}
            </span>
            {stack.length > 0 && (
              <Button
                type="button"
                size="xs"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  const parent = stack[stack.length - 1]!;
                  setStack((s) => s.slice(0, -1));
                  select(parent);
                }}
              >
                {w("back")}
              </Button>
            )}
            {(detail.status === 1 || detail.status === 2) && (
              <Button
                type="button"
                size="xs"
                variant="secondary"
                disabled={busy || readOnly}
                onClick={() => setConfirmation("stop")}
              >
                {w("stop")}
              </Button>
            )}
            {(detail.status === 3 || detail.status === 10) && (
              <Button
                type="button"
                size="xs"
                disabled={busy || readOnly}
                onClick={() => setConfirmation("retry")}
              >
                {w("retry")}
              </Button>
            )}
          </div>
          <div className="wf-instance-main">
            <WorkflowCanvas
              draft={graph}
              runtime={detail.peworkflowDAG?.nodes}
              locale={locale}
              editable={false}
              graphKey={`${connectionId}:${appId}:instance:${detail.wfInstanceId}`}
              selectedKey={nodeKey}
              onSelect={(key) => {
                if (!busy) {
                  setNodeKey(key);
                  setConfirmation(null);
                  setShowTask(false);
                }
              }}
            />
            <aside className="wf-inspector">
              <h3>{w("instances")}</h3>
              <dl>
                <dt>{w("triggered")}</dt>
                <dd>{detail.actualTriggerTime ?? "—"}</dd>
                <dt>{w("finished")}</dt>
                <dd>{detail.finishedTime ?? "—"}</dd>
              </dl>
              {[
                [w("initParams"), detail.wfInitParams],
                [w("context"), detail.wfContext],
                [w("result"), detail.result],
              ].map(([label, value]) => (
                <details key={label}>
                  <summary>{label}</summary>
                  <pre>{value ?? "—"}</pre>
                </details>
              ))}
              {node ? (
                <>
                  <h3>{node.nodeName || node.nodeId}</h3>
                  <dl>
                    <dt>{w("status")}</dt>
                    <dd>
                      {node.disableByControlNode
                        ? w("controlled")
                        : node.enable === false
                          ? w("skipped")
                          : statusLabel(node.status, "NORMAL", locale)}
                    </dd>
                    <dt>{w("nodeInstance")}</dt>
                    <dd>{node.instanceId ?? "—"}</dd>
                    <dt>{w("triggered")}</dt>
                    <dd>{node.startTime ?? "—"}</dd>
                    <dt>{w("finished")}</dt>
                    <dd>{node.finishedTime ?? "—"}</dd>
                  </dl>
                  <details>
                    <summary>{w("params")}</summary>
                    <pre>{node.nodeParams ?? "—"}</pre>
                  </details>
                  <details>
                    <summary>
                      {w(node.nodeType === 2 ? "branchResult" : "result")}
                    </summary>
                    <pre>{node.result ?? "—"}</pre>
                  </details>
                  {node.nodeType === 3 && node.instanceId && (
                    <Button
                      type="button"
                      size="xs"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        setStack((s) => [...s, detail.wfInstanceId]);
                        select(node.instanceId!);
                      }}
                    >
                      {w("nested")}
                    </Button>
                  )}
                  {canMarkSuccess(detail, node) && (
                    <Button
                      type="button"
                      size="xs"
                      variant="secondary"
                      disabled={busy || readOnly}
                      onClick={() => setConfirmation("markSuccess")}
                    >
                      {w("markSuccess")}
                    </Button>
                  )}
                  {node.nodeType !== 2 &&
                  node.nodeType !== 3 &&
                  node.instanceId ? (
                    <>
                      <Button
                        type="button"
                        size="xs"
                        variant="secondary"
                        onClick={() => setShowTask(true)}
                      >
                        {w("details")}
                      </Button>
                      <div className="wf-node-logs">
                        <LogViewer
                          key={node.instanceId}
                          connectionId={connectionId}
                          appId={appId}
                          instanceId={node.instanceId}
                          t={t}
                        />
                      </div>
                    </>
                  ) : (
                    node.nodeType !== 2 && <p>{w("notStarted")}</p>
                  )}
                </>
              ) : (
                <p>{w("selectNode")}</p>
              )}
            </aside>
          </div>
        </>
      )}
      {showTask && node?.instanceId && (
        <InstanceDialog
          instance={{ instanceId: node.instanceId }}
          type="WORKFLOW"
          connectionId={connectionId}
          appId={appId}
          locale={locale}
          onClose={() => setShowTask(false)}
          t={t}
        />
      )}
      {confirmation && (
        <ConfirmActionDialog
          title={w(confirmation)}
          message={w(
            confirmation === "stop"
              ? "stopWarning"
              : confirmation === "retry"
                ? "runWarning"
                : "markWarning",
          )}
          confirmLabel={w("confirmAction")}
          busy={busy}
          onConfirm={() => void performAction()}
          onClose={() => setConfirmation(null)}
          t={t}
        />
      )}
    </div>
  );
}
