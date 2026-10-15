import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
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
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../components/ui/resizable";
import { useStoredPanelSize } from "../hooks/useStoredPanelSize";
import { useStorageToast } from "../hooks/useStorageToast";
import type { Locale } from "../i18n";
import type { T } from "../uiTypes";
import type { Page } from "../types";
import { workflowText } from "./i18n";
import { useWorkflowNotice } from "./useWorkflowNotice";
import { WorkflowCanvas } from "./WorkflowCanvas";
import { canMarkSuccess, runtimeDraft } from "./model";
import type { WorkflowInstance } from "./types";

function DetailDisclosure({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <details className="group my-1.5">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded border border-[var(--color-border,#d7dce5)] bg-[var(--color-muted,#eef1f5)] px-2 py-1.5 text-xs font-medium hover:brightness-95 focus-visible:outline-2 focus-visible:outline-[var(--color-primary,#3565c8)] [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="size-3.5 shrink-0 transition-transform group-open:rotate-90"
        />
        {label}
      </summary>
      <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded border border-[var(--color-border,#d7dce5)] bg-[var(--color-muted,#eef1f5)] p-2 font-mono text-[11px] leading-relaxed">
        {value ?? "—"}
      </pre>
    </details>
  );
}

export function WorkflowInstances({
  connectionId,
  appId,
  locale,
  t,
  readOnly,
  workflowId,
  initialInstanceId = "",
  onBusyChange,
}: {
  connectionId: string;
  appId: string;
  locale: Locale;
  t: T;
  readOnly: boolean;
  workflowId: string;
  initialInstanceId?: string;
  onBusyChange: (busy: boolean) => void;
}) {
  const w = workflowText(locale);
  const inspectorLayout = useStoredPanelSize(
    "local.powerjob.workflow.instance-inspector-width",
    220,
  );
  const listLayout = useStoredPanelSize(
    "local.powerjob.workflow.instance-list-height",
    90,
  );
  useStorageToast(
    "workflow-instance-inspector-layout",
    inspectorLayout.failed,
    inspectorLayout.retry,
    t,
  );
  useStorageToast(
    "workflow-instance-list-layout",
    listLayout.failed,
    listLayout.retry,
    t,
  );
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [instanceId, setInstanceId] = useState("");
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState({
    wfInstanceId: "",
    status: "",
  });
  const [index, setIndex] = useState(0);
  const [page, setPage] = useState<Page<WorkflowInstance> | null>(null);
  const [error, setError] = useState("");
  useWorkflowNotice(error);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState(initialInstanceId);
  const [detail, setDetail] = useState<WorkflowInstance | null>(null);
  const [nodeKey, setNodeKey] = useState("");
  const [detailError, setDetailError] = useState("");
  useWorkflowNotice(detailError);
  const [stack, setStack] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState<{
    kind: "stop" | "retry" | "markSuccess";
    wfInstanceId: string;
    nodeId?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const actionPending = useRef(false);
  const actionToastId = useId();
  const [showTask, setShowTask] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      toast.dismiss(actionToastId);
    };
  }, [actionToastId]);
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
          workflowId,
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
  }, [connectionId, appId, workflowId, index, filter, refresh]);
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
    setDetailError("");
  }
  const graph = useMemo(() => (detail ? runtimeDraft(detail) : null), [detail]);
  const node = detail?.peworkflowDAG?.nodes.find((n) => n.nodeId === nodeKey);
  async function performAction() {
    if (!confirmation || actionPending.current || readOnly) return;
    const target = confirmation;
    actionPending.current = true;
    onBusyChange(true);
    setBusy(true);
    toast.loading(w(target.kind), {
      id: actionToastId,
      duration: Infinity,
      closeButton: false,
    });
    try {
      const method =
        target.kind === "stop"
          ? "powerjob/stopWorkflowInstance"
          : target.kind === "retry"
            ? "powerjob/retryWorkflowInstance"
            : "powerjob/markWorkflowNodeSuccess";
      const result = await invoke(connectionId, method, {
        appId,
        wfInstanceId: target.wfInstanceId,
        ...(target.nodeId ? { nodeId: target.nodeId } : {}),
      });
      if (mounted.current) {
        setConfirmation(null);
        toast[result.verified === false ? "warning" : "success"](
          w(result.verified === false ? "unconfirmed" : "requested"),
          {
            id: actionToastId,
            duration: result.verified === false ? 8000 : 4000,
            closeButton: true,
          },
        );
        if (result.instance?.wfInstanceId === selected) setDetail(result.instance);
        setRefresh((n) => n + 1);
      }
    } catch (e) {
      if (mounted.current)
        toast.error(String(e), {
          id: actionToastId,
          duration: 8000,
          closeButton: true,
        });
    } finally {
      actionPending.current = false;
      if (mounted.current) {
        onBusyChange(false);
        setBusy(false);
      }
    }
  }
  return (
    <div className="wf-instances">
      <div className="wf-inline wf-filters">
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
            <NativeSelectOption
              key={s}
              value={s}
            >
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
            setFilter({ wfInstanceId: instanceId, status });
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
      {listLayout.ready && (
        <ResizablePanelGroup
          orientation="vertical"
          className="min-h-0 min-w-0 flex-1"
          onLayoutChanged={listLayout.onLayoutChanged}
        >
          <ResizablePanel
            id="workflow-instance-list-panel"
            minSize={90}
            defaultSize={listLayout.size ?? 210}
            panelRef={listLayout.panelRef}
            onResize={listLayout.onResize}
            groupResizeBehavior="preserve-pixel-size"
          >
            <div className="flex h-full min-h-0 flex-col">
              <div className="wf-instance-list !max-h-none !min-h-0 flex-1">
                <table className="instances-table">
                  <thead>
                    <tr>
                      <th>{w("instanceId")}</th>
                      <th>{w("name")}</th>
                      <th>{w("status")}</th>
                      <th>{w("triggered")}</th>
                      <th>{w("finished")}</th>
                      <th>
                        {stack.length > 0 ? (
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => {
                              const parent = stack[stack.length - 1]!;
                              setStack((items) => items.slice(0, -1));
                              select(parent);
                            }}
                          >
                            {w("back")}
                          </Button>
                        ) : w("actions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {!page?.data.length ? (
                      <tr>
                        <td colSpan={6}>{w(loading ? "loading" : "empty")}</td>
                      </tr>
                    ) : (
                      page.data.map((row) => (
                        <tr
                          key={row.wfInstanceId}
                          tabIndex={0}
                          aria-selected={selected === row.wfInstanceId}
                          className={
                            selected === row.wfInstanceId ? "selected" : ""
                          }
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
                              {statusLabel(
                                row.status,
                                "WORKFLOW_INSTANCE",
                                locale,
                              )}
                            </span>
                          </td>
                          <td>{row.actualTriggerTime}</td>
                          <td>{row.finishedTime}</td>
                          <td className="instance-actions">
                            {(row.status === 1 || row.status === 2) && (
                              <Button
                                type="button"
                                size="xs"
                                variant="secondary"
                                disabled={busy || readOnly}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setConfirmation({ kind: "stop", wfInstanceId: row.wfInstanceId });
                                }}
                              >
                                {w("stop")}
                              </Button>
                            )}
                            {(row.status === 3 || row.status === 10) && (
                              <Button
                                type="button"
                                size="xs"
                                variant="secondary"
                                disabled={busy || readOnly}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setConfirmation({ kind: "retry", wfInstanceId: row.wfInstanceId });
                                }}
                              >
                                {w("retry")}
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <Pager
                page={page}
                onPage={setIndex}
                t={t}
              />
            </div>
          </ResizablePanel>
          <ResizableHandle
            withHandle
            aria-label={w("resizeInstanceList")}
          />
          <ResizablePanel
            id="workflow-instance-canvas-panel"
            minSize={300}
          >
            <div className="flex h-full min-h-0 flex-col">
              {!detail || !graph ? (
                <p className="wf-empty">
                  {w(selected ? "loading" : "selectInstance")}
                </p>
              ) : (
                <>
                  <div className="wf-instance-main">
                    {inspectorLayout.ready && (
                      <ResizablePanelGroup
                        orientation="horizontal"
                        className="min-h-0 min-w-0 flex-1"
                        onLayoutChanged={inspectorLayout.onLayoutChanged}
                      >
                        <ResizablePanel
                          id="workflow-instance-graph-panel"
                          minSize={320}
                        >
                          <div className="flex h-full min-h-0 min-w-0">
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
                          </div>
                        </ResizablePanel>
                        <ResizableHandle
                          withHandle
                          aria-label={w("resizeInspector")}
                        />
                        <ResizablePanel
                          id="workflow-instance-inspector-panel"
                          minSize={220}
                          defaultSize={inspectorLayout.size ?? 310}
                          collapsedSize={36}
                          collapsible
                          panelRef={inspectorLayout.panelRef}
                          onResize={(size) => {
                            inspectorLayout.onResize(size);
                            setInspectorCollapsed(size.inPixels <= 40);
                          }}
                          groupResizeBehavior="preserve-pixel-size"
                        >
                          <aside className="wf-inspector h-full! w-full! min-w-0!">
                            <div className="mb-2 flex items-center justify-between gap-1">
                              {!inspectorCollapsed && (
                                <h3 className="m-0!">{w("nodeDetails")}</h3>
                              )}
                              <Button
                                type="button"
                                size="xs"
                                variant="ghost"
                                className="size-6! shrink-0 p-0!"
                                aria-label={w(
                                  inspectorCollapsed
                                    ? "expandDetails"
                                    : "collapseDetails",
                                )}
                                title={w(
                                  inspectorCollapsed
                                    ? "expandDetails"
                                    : "collapseDetails",
                                )}
                                onClick={() =>
                                  inspectorCollapsed
                                    ? inspectorLayout.panelRef.current?.expand()
                                    : inspectorLayout.panelRef.current?.collapse()
                                }
                              >
                                {inspectorCollapsed ? (
                                  <ChevronLeft
                                    aria-hidden="true"
                                    className="size-4"
                                  />
                                ) : (
                                  <ChevronRight
                                    aria-hidden="true"
                                    className="size-4"
                                  />
                                )}
                              </Button>
                            </div>
                            {!inspectorCollapsed && (
                              <>
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
                                            : statusLabel(
                                                node.status,
                                                "NORMAL",
                                                locale,
                                              )}
                                      </dd>
                                      <dt>{w("nodeInstance")}</dt>
                                      <dd>{node.instanceId ?? "—"}</dd>
                                      <dt>{w("triggered")}</dt>
                                      <dd>{node.startTime ?? "—"}</dd>
                                      <dt>{w("finished")}</dt>
                                      <dd>{node.finishedTime ?? "—"}</dd>
                                    </dl>
                                    <DetailDisclosure
                                      label={w("params")}
                                      value={node.nodeParams}
                                    />
                                    <DetailDisclosure
                                      label={w(
                                        node.nodeType === 2
                                          ? "branchResult"
                                          : "result",
                                      )}
                                      value={node.result}
                                    />
                                    {node.nodeType === 3 && node.instanceId && (
                                      <Button
                                        type="button"
                                        size="xs"
                                        variant="secondary"
                                        disabled={busy}
                                        onClick={() => {
                                          setStack((s) => [
                                            ...s,
                                            detail.wfInstanceId,
                                          ]);
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
                                        onClick={() =>
                                          setConfirmation({
                                            kind: "markSuccess",
                                            wfInstanceId: detail.wfInstanceId,
                                            nodeId: node.nodeId,
                                          })
                                        }
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
                                      node.nodeType !== 2 && (
                                        <p>{w("notStarted")}</p>
                                      )
                                    )}
                                  </>
                                ) : (
                                  <p>{w("selectNode")}</p>
                                )}
                              </>
                            )}
                          </aside>
                        </ResizablePanel>
                      </ResizablePanelGroup>
                    )}
                  </div>
                </>
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
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
          title={`${w(confirmation.kind)} · #${confirmation.wfInstanceId}`}
          message={w(
            confirmation.kind === "stop"
              ? "stopWarning"
              : confirmation.kind === "retry"
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
