import { useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import { invoke, getHost } from "../host";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../components/ui/resizable";
import { useStoredPanelSize } from "../hooks/useStoredPanelSize";
import { useStorageToast } from "../hooks/useStorageToast";
import type { T } from "../uiTypes";
import {
  NativeSelect,
  NativeSelectOption,
} from "../components/ui/native-select";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import type { Locale } from "../i18n";
import { WorkflowCanvas } from "./WorkflowCanvas";
import { NodeEditor } from "./NodeEditor";
import { NotificationUserSelect } from "./NotificationUserSelect";
import {
  definitionDraft,
  draftErrors,
  draftSignature,
  newDraftNode,
} from "./model";
import { workflowText, type WorkflowTextKey } from "./i18n";
import { useWorkflowNotice } from "./useWorkflowNotice";
import type { WorkflowDefinition, WorkflowDraft, SaveOperation } from "./types";

export type EditorGuard = {
  dirty: boolean;
  busy: boolean;
  saveThen: (callback: () => void) => void;
};
function localDate(ms?: number | null): string {
  if (ms == null) return "";
  const d = new Date(ms);
  return new Date(ms - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function WorkflowEditor({
  definition,
  connectionId,
  appId,
  locale,
  t,
  readOnly,
  onSaved,
  onGuard,
}: {
  definition?: WorkflowDefinition;
  connectionId: string;
  appId: string;
  locale: Locale;
  t: T;
  readOnly: boolean;
  onSaved: (definition: WorkflowDefinition) => void;
  onGuard: (guard: EditorGuard) => void;
}) {
  const w = workflowText(locale);
  const [configExpanded, setConfigExpanded] = useState(true);
  const configId = useId();
  const inspectorLayout = useStoredPanelSize(
    "local.powerjob.readonly.workflow-inspector-width",
    220,
  );
  useStorageToast(
    "workflow-inspector-layout",
    inspectorLayout.failed,
    inspectorLayout.retry,
    t,
  );
  const initial = useRef(definitionDraft(definition));
  const [draft, setDraft] = useState<WorkflowDraft>(initial.current);
  const [baseline, setBaseline] = useState(() =>
    draftSignature(initial.current),
  );
  const [editing, setEditing] = useState(!definition);
  const [selected, setSelected] = useState("");
  const [undo, setUndo] = useState<WorkflowDraft[]>([]);
  const [redo, setRedo] = useState<WorkflowDraft[]>([]);
  const [operation, setOperation] = useState<SaveOperation | null>(null);
  const [error, setError] = useState("");
  useWorkflowNotice(error);
  const [saveToastId] = useState(() => `workflow-save:${crypto.randomUUID()}`);
  const submitting = useRef(false);
  const [starting, setStarting] = useState(false);
  const mounted = useRef(true);
  const afterSave = useRef<(() => void) | null>(null);
  const tokenKey = `local.powerjob.workflow.save.v1:${connectionId}:${appId}:${definition?.id ?? "new"}`;
  const [recoverToken, setRecoverToken] = useState("");
  const [restoreReady, setRestoreReady] = useState(false);
  const [pollEpoch, setPollEpoch] = useState(0);
  const [clearRecord, setClearRecord] = useState(false);
  const clearing = useRef(false);
  const [clearingRecord, setClearingRecord] = useState(false);
  const completed = useRef("");
  const unresolved =
    !!operation &&
    ["partial", "unknown", "unverified"].includes(operation.state);
  const dirty = draftSignature(draft) !== baseline;
  const busy = starting || operation?.state === "running" || !restoreReady;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const commit = useCallback(
    (next: WorkflowDraft, record = true) => {
      if (record) {
        setUndo((prev) => [...prev.slice(-49), draft]);
        setRedo([]);
      }
      setDraft(next);
    },
    [draft],
  );
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const host = getHost();
        await host.ready;
        const token = host.capabilities?.storage
          ? await host.storage?.get(tokenKey)
          : null;
        if (active && typeof token === "string") setRecoverToken(token);
      } catch (e) {
        if (active) setError(String(e));
      } finally {
        if (active) setRestoreReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [tokenKey]);
  const complete = useCallback(
    (op: SaveOperation) => {
      setOperation(op);
      if (
        op.state === "succeeded" &&
        op.definition &&
        completed.current !== op.operationId
      ) {
        completed.current = op.operationId;
        const next = definitionDraft(op.definition);
        const positions = new Map(
          draft.nodes.map((n) => [op.nodeIds[n.key] ?? n.key, n.position]),
        );
        next.nodes = next.nodes.map((n) => ({
          ...n,
          position: positions.get(n.key),
        }));
        setDraft(next);
        setBaseline(draftSignature(next));
        setUndo([]);
        setRedo([]);
        setEditing(false);
        void (async () => {
          try {
            const host = getHost();
            await host.ready;
            if (host.capabilities?.storage)
              await host.storage?.delete(tokenKey);
          } catch (e) {
            if (mounted.current) setError(String(e));
          }
        })();
        const callback = afterSave.current;
        afterSave.current = null;
        onSaved(op.definition);
        callback?.();
      }
    },
    [draft.nodes, onSaved, tokenKey],
  );
  const completeRef = useRef(complete);
  completeRef.current = complete;
  useEffect(() => {
    const token = operation?.operationId ?? recoverToken;
    if (!token) return;
    let active = true,
      inFlight = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (inFlight || !active) return;
      inFlight = true;
      try {
        const value = await invoke(
          connectionId,
          "powerjob/workflowSaveStatus",
          { appId, operationId: token },
        );
        if (!active) return;
        setError("");
        completeRef.current(value);
        if (value.state === "running")
          timer = setTimeout(() => void poll(), 1000);
      } catch (e) {
        if (active) {
          setError(`${w("operationMissing")} ${String(e)}`);
          timer = setTimeout(() => void poll(), 5000);
        }
      } finally {
        inFlight = false;
      }
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    connectionId,
    appId,
    operation?.operationId,
    recoverToken,
    locale,
    pollEpoch,
  ]);
  async function save() {
    if (submitting.current || busy || readOnly || (recoverToken && !operation))
      return;
    const issues = draftErrors(draft);
    if (issues.length) {
      toast.error(w(issues[0] as WorkflowTextKey), {
        description:
          issues
            .slice(1)
            .map((key) => w(key as WorkflowTextKey))
            .join("\n") || undefined,
        duration: 8000,
        closeButton: true,
      });
      afterSave.current = null;
      return;
    }
    if (
      operation &&
      ["unknown", "partial", "unverified"].includes(operation.state)
    ) {
      setError(w("partialWarning"));
      afterSave.current = null;
      return;
    }
    submitting.current = true;
    setStarting(true);
    setError("");
    setOperation(null);
    setRecoverToken("");
    toast.loading(w("saving"), {
      id: saveToastId,
      duration: Infinity,
      closeButton: false,
    });
    const operationId = crypto.randomUUID();
    // Persist intent before starting any write so a reload can recover a lost RPC response.
    try {
      const host = getHost();
      await host.ready;
      if (host.capabilities?.storage)
        await host.storage?.set(tokenKey, operationId);
      const result = await invoke(connectionId, "powerjob/saveWorkflow", {
        appId,
        operationId,
        draft,
      });
      if (mounted.current) {
        setRecoverToken(operationId);
        setOperation(result);
      }
    } catch (e) {
      if (mounted.current) {
        setError(String(e));
        setRecoverToken(operationId);
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setStarting(false);
    }
  }
  const saveRef = useRef(save);
  saveRef.current = save;
  onGuard({
    dirty: dirty || unresolved || (!!recoverToken && !operation),
    busy,
    saveThen: (callback) => {
      afterSave.current = callback;
      void saveRef.current();
    },
  });
  useEffect(() => {
    if (!editing || busy) return;
    function shortcut(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.closest("input,textarea,select,[contenteditable=true]"))
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redoDraft();
        else undoDraft();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redoDraft();
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [editing, busy, undo, redo, draft]);
  function undoDraft() {
    if (!undo.length) return;
    const previous = undo[undo.length - 1]!;
    setRedo((r) => [...r, draft]);
    setUndo((u) => u.slice(0, -1));
    setDraft(previous);
  }
  function redoDraft() {
    if (!redo.length) return;
    const next = redo[redo.length - 1]!;
    setUndo((u) => [...u, draft]);
    setRedo((r) => r.slice(0, -1));
    setDraft(next);
  }
  const active = draft.nodes.find((n) => n.key === selected);
  const locked =
    busy ||
    readOnly ||
    !editing ||
    unresolved ||
    (!!recoverToken && !operation);
  async function resumeOperation() {
    if (
      submitting.current ||
      busy ||
      readOnly ||
      !operation ||
      !["partial", "unverified"].includes(operation.state)
    )
      return;
    submitting.current = true;
    setStarting(true);
    setError("");
    try {
      const result = await invoke(connectionId, "powerjob/saveWorkflow", {
        appId,
        operationId: operation.operationId,
        resume: true,
      });
      if (mounted.current) {
        setOperation(result);
        setRecoverToken(result.operationId);
        setPollEpoch((n) => n + 1);
      }
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      submitting.current = false;
      if (mounted.current) setStarting(false);
    }
  }
  useEffect(() => {
    if (starting && !operation) {
      toast.loading(w("saving"), {
        id: saveToastId,
        duration: Infinity,
        closeButton: false,
      });
    } else if (!operation && !recoverToken) {
      toast.dismiss(saveToastId);
    } else if (!operation) {
      toast.warning(w("partialWarning"), {
        id: saveToastId,
        duration: Infinity,
        closeButton: false,
        dismissible: false,
        action: {
          label: w("clearRecord"),
          onClick: (event) => {
            event.preventDefault();
            if (!busy) setClearRecord(true);
          },
        },
      });
    } else if (operation.state === "running") {
      toast.loading(w(operation.stage), {
        id: saveToastId,
        duration: Infinity,
        closeButton: false,
      });
    } else if (operation.state === "succeeded") {
      toast.success(w("succeeded"), {
        id: saveToastId,
        duration: 4000,
        closeButton: true,
      });
    } else {
      const mapping = Object.entries(operation.nodeIds)
        .map(([draftId, savedId]) => `${draftId} → ${savedId}`)
        .join(", ");
      const description = [
        operation.error,
        unresolved ? w("partialWarning") : "",
        mapping ? `${w("nodeMapping")}: ${mapping}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const canResume =
        !readOnly && ["partial", "unverified"].includes(operation.state);
      toast[unresolved ? "warning" : "error"](w(operation.state), {
        id: saveToastId,
        description,
        duration: unresolved ? Infinity : 8000,
        closeButton: !unresolved,
        dismissible: !unresolved,
        action: canResume
          ? {
              label: w("resume"),
              onClick: (event) => {
                event.preventDefault();
                void resumeOperation();
              },
            }
          : unresolved
            ? {
                label: w("clearRecord"),
                onClick: (event) => {
                  event.preventDefault();
                  if (!busy) setClearRecord(true);
                },
              }
            : undefined,
        cancel: canResume
          ? {
              label: w("clearRecord"),
              onClick: (event) => {
                event.preventDefault();
                if (!busy) setClearRecord(true);
              },
            }
          : undefined,
      });
    }
    return () => {
      if (operation?.state !== "succeeded") toast.dismiss(saveToastId);
    };
  }, [
    operation,
    recoverToken,
    readOnly,
    busy,
    starting,
    locale,
    saveToastId,
    unresolved,
  ]);
  return (
    <div className="wf-editor">
      <div className="wf-editor-toolbar">
        {dirty && <span className="wf-toolbar-status">{w("unsaved")}</span>}
        <Button
          type="button"
          size="xs"
          variant="secondary"
          disabled={busy || readOnly || editing}
          onClick={() => setEditing(true)}
        >
          {w("edit")}
        </Button>
        {editing && (
          <>
            <Button
              type="button"
              size="xs"
              disabled={locked}
              onClick={() => void save()}
            >
              {w("save")}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={locked || !undo.length}
              onClick={undoDraft}
            >
              {w("undo")}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={locked || !redo.length}
              onClick={redoDraft}
            >
              {w("redo")}
            </Button>
          </>
        )}
      </div>
      <section
        className="wf-definition-config"
        aria-label={w("definitions")}
      >
        <div className="flex">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="wf-definition-toggle"
            aria-expanded={configExpanded}
            aria-controls={configId}
            onClick={() => setConfigExpanded((value) => !value)}
          >
            {configExpanded ? (
              <ChevronDown
                data-icon="inline-start"
                aria-hidden="true"
              />
            ) : (
              <ChevronRight
                data-icon="inline-start"
                aria-hidden="true"
              />
            )}
            {w("definitions")}
          </Button>
        </div>
        <div
          id={configId}
          hidden={!configExpanded}
          className="wf-definition-body"
        >
          <fieldset
            disabled={locked}
            className="wf-fieldset wf-definition-fields"
          >
            <legend className="sr-only">{w("definitions")}</legend>
            <label>
              {w("name")}
              <Input
                value={draft.config.wfName}
                onChange={(e) =>
                  commit({
                    ...draft,
                    config: { ...draft.config, wfName: e.target.value },
                  })
                }
              />
            </label>
            <label>
              {w("description")}
              <Input
                value={draft.config.wfDescription ?? ""}
                onChange={(e) =>
                  commit({
                    ...draft,
                    config: {
                      ...draft.config,
                      wfDescription: e.target.value,
                    },
                  })
                }
              />
            </label>
            <label>
              {w("schedule")}
              <NativeSelect
                value={draft.config.timeExpressionType}
                onChange={(e) =>
                  commit({
                    ...draft,
                    config: {
                      ...draft.config,
                      timeExpressionType: e.target.value,
                    },
                  })
                }
              >
                <NativeSelectOption value="API">API</NativeSelectOption>
                <NativeSelectOption value="CRON">CRON</NativeSelectOption>
                {!["API", "CRON"].includes(draft.config.timeExpressionType) && (
                  <NativeSelectOption value={draft.config.timeExpressionType}>
                    {draft.config.timeExpressionType}
                  </NativeSelectOption>
                )}
              </NativeSelect>
            </label>
            {draft.config.timeExpressionType !== "API" && (
              <label>
                {w("cron")}
                <Input
                  value={draft.config.timeExpression ?? ""}
                  onChange={(e) =>
                    commit({
                      ...draft,
                      config: {
                        ...draft.config,
                        timeExpression: e.target.value,
                      },
                    })
                  }
                />
              </label>
            )}
            <label>
              {w("concurrency")}
              <Input
                type="number"
                min={1}
                value={draft.config.maxWfInstanceNum}
                onChange={(e) =>
                  commit({
                    ...draft,
                    config: {
                      ...draft.config,
                      maxWfInstanceNum: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <label className="wf-check">
              <input
                type="checkbox"
                checked={draft.config.enable}
                onChange={(e) =>
                  commit({
                    ...draft,
                    config: { ...draft.config, enable: e.target.checked },
                  })
                }
              />
              {w("enabled")}
            </label>
            {(["start", "end"] as const).map((key) => (
              <label key={key}>
                {w(key === "start" ? "lifecycleStart" : "lifecycleEnd")}
                <Input
                  type="datetime-local"
                  value={localDate(draft.config.lifeCycle?.[key])}
                  onChange={(e) =>
                    commit({
                      ...draft,
                      config: {
                        ...draft.config,
                        lifeCycle: {
                          ...draft.config.lifeCycle,
                          [key]: e.target.value
                            ? new Date(e.target.value).getTime()
                            : null,
                        },
                      },
                    })
                  }
                />
              </label>
            ))}
            <NotificationUserSelect
              connectionId={connectionId}
              appId={appId}
              locale={locale}
              disabled={locked}
              value={draft.config.notifyUserIds ?? []}
              onChange={(notifyUserIds) =>
                commit({
                  ...draft,
                  config: {
                    ...draft.config,
                    notifyUserIds,
                  },
                })
              }
            />
          </fieldset>
        </div>
      </section>

      <div className="wf-editor-main">
        {inspectorLayout.ready && (
          <ResizablePanelGroup
            orientation="horizontal"
            className="wf-editor-split"
            onLayoutChanged={inspectorLayout.onLayoutChanged}
          >
            <ResizablePanel
              id="workflow-graph-panel"
              minSize={320}
            >
              <div className="wf-editor-graph">
                <WorkflowCanvas
                  toolbar={
                    <div className="wf-toolbar-group wf-add-bar">
                      {([1, 2, 3] as const).map((kind) => (
                        <Button
                          type="button"
                          size="xs"
                          variant="secondary"
                          key={kind}
                          disabled={locked}
                          onClick={() => {
                            const node = newDraftNode(kind);
                            commit({
                              ...draft,
                              nodes: [...draft.nodes, node],
                            });
                            setSelected(node.key);
                          }}
                        >
                          {w(
                            kind === 1
                              ? "task"
                              : kind === 2
                                ? "decision"
                                : "nested",
                          )}
                        </Button>
                      ))}
                    </div>
                  }
                  draft={draft}
                  locale={locale}
                  editable={!locked}
                  graphKey={`${connectionId}:${appId}:definition:${draft.id ?? "new"}`}
                  selectedKey={selected}
                  onSelect={setSelected}
                  onChange={commit}
                />
              </div>
            </ResizablePanel>
            <ResizableHandle
              withHandle
              aria-label={w("resizeInspector")}
            />
            <ResizablePanel
              id="workflow-inspector-panel"
              minSize={220}
              defaultSize={inspectorLayout.size ?? 310}
              panelRef={inspectorLayout.panelRef}
              onResize={inspectorLayout.onResize}
              groupResizeBehavior="preserve-pixel-size"
            >
              <aside className="wf-inspector">
                {active ? (
                  <NodeEditor
                    key={active.key}
                    node={active}
                    connectionId={connectionId}
                    appId={appId}
                    locale={locale}
                    disabled={locked}
                    onChange={(node) =>
                      commit({
                        ...draft,
                        nodes: draft.nodes.map((n) =>
                          n.key === node.key ? node : n,
                        ),
                      })
                    }
                    onDelete={() => {
                      commit({
                        ...draft,
                        nodes: draft.nodes.filter((n) => n.key !== selected),
                        edges: draft.edges.filter(
                          (e) => e.from !== selected && e.to !== selected,
                        ),
                      });
                      setSelected("");
                    }}
                    onDuplicate={() => {
                      const node = {
                        ...active,
                        key: `draft-${crypto.randomUUID()}`,
                        nodeId: undefined,
                        position: active.position
                          ? {
                              x: active.position.x + 40,
                              y: active.position.y + 110,
                            }
                          : undefined,
                      };
                      commit({ ...draft, nodes: [...draft.nodes, node] });
                      setSelected(node.key);
                    }}
                  />
                ) : (
                  <p>{w("selectNode")}</p>
                )}
              </aside>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
      {clearRecord && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!clearing.current) setClearRecord(open);
          }}
        >
          <DialogContent className="confirm-action-dialog">
            <DialogTitle>{w("clearRecord")}</DialogTitle>
            <p>{w("clearWarning")}</p>
            <div className="wf-inline">
              <Button
                type="button"
                size="xs"
                variant="secondary"
                disabled={clearingRecord}
                onClick={() => setClearRecord(false)}
              >
                {w("cancel")}
              </Button>
              <Button
                type="button"
                size="xs"
                disabled={busy || clearingRecord}
                onClick={() => {
                  if (clearing.current || busy) return;
                  clearing.current = true;
                  setClearingRecord(true);
                  void (async () => {
                    try {
                      const host = getHost();
                      await host.ready;
                      if (host.capabilities?.storage)
                        await host.storage?.delete(tokenKey);
                      if (definition) {
                        const fresh = await invoke(
                          connectionId,
                          "powerjob/workflow",
                          { appId, workflowId: definition.id },
                        );
                        const next = definitionDraft(fresh);
                        setDraft(next);
                        setBaseline(draftSignature(next));
                        onSaved(fresh);
                      }
                      setOperation(null);
                      setRecoverToken("");
                      setError("");
                      setClearRecord(false);
                      setUndo([]);
                      setRedo([]);
                      toast.success(w("clearRecord"), {
                        duration: 4000,
                        closeButton: true,
                      });
                    } catch (e) {
                      setError(String(e));
                    } finally {
                      clearing.current = false;
                      if (mounted.current) setClearingRecord(false);
                    }
                  })();
                }}
              >
                {w("confirmAction")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
