import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "../host";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
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
import { WorkflowEditor, type EditorGuard } from "./WorkflowEditor";
import { WorkflowInstances } from "./WorkflowInstances";
import type { WorkflowDefinition } from "./types";
import { WorkflowContextMenu, type WorkflowMenu } from "./WorkflowContextMenu";

export type WorkflowToolbarActions = {
  connectionId: string;
  appId: string;
  create: () => void;
  refresh: () => void;
  createDisabled: boolean;
};

export default function WorkflowWorkspace({
  connectionId,
  appId,
  locale,
  t,
  registerNavigation,
  registerActions,
}: {
  connectionId: string;
  appId: string;
  locale: Locale;
  t: T;
  registerNavigation: (guard: ((action: () => void) => void) | null) => void;
  registerActions: (actions: WorkflowToolbarActions | null) => void;
}) {
  const w = workflowText(locale);
  const [menu, setMenu] = useState<WorkflowMenu | null>(null);
  const [actionWorkflow, setActionWorkflow] =
    useState<WorkflowDefinition | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const listLayout = useStoredPanelSize(
    "local.powerjob.readonly.workflow-list-width",
    180,
  );
  useStorageToast(
    "workflow-list-layout",
    listLayout.failed,
    listLayout.retry,
    t,
  );
  const [tab, setTab] = useState<"definitions" | "instances">("definitions");
  const [index, setIndex] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<Page<WorkflowDefinition> | null>(null);
  const [selected, setSelected] = useState("");
  const [definition, setDefinition] = useState<WorkflowDefinition | undefined>(
    undefined,
  );
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [readOnly, setReadOnly] = useState(false);
  const [capabilitiesReady, setCapabilitiesReady] = useState(false);
  const [instanceTarget, setInstanceTarget] = useState({
    workflowId: "",
    instanceId: "",
  });
  const guard = useRef<EditorGuard | null>(null);
  const [leave, setLeave] = useState<(() => void) | null>(null);
  const [action, setAction] = useState<
    "run" | "copy" | "delete" | "enable" | "disable" | null
  >(null);
  const [busy, setBusy] = useState(false);
  const actionPending = useRef(false);
  const [params, setParams] = useState("");
  const [delay, setDelay] = useState("0");
  const [message, setMessage] = useState("");
  const mounted = useRef(true);
  useEffect(
    () => setMenu(null),
    [page, selected, connectionId, appId, busy, tab],
  );
  function openMenu(
    row: WorkflowDefinition,
    trigger: HTMLButtonElement,
    x: number,
    y: number,
  ) {
    if (actionPending.current || guard.current?.busy) return;
    setMenu({ workflow: row, trigger, x, y });
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const navigate = useCallback(
    (callback: () => void) => {
      if (actionPending.current || guard.current?.busy) {
        setError(w("savingLeave"));
        return;
      }
      if (guard.current?.dirty) {
        setLeave(() => callback);
        return;
      }
      callback();
    },
    [locale],
  );
  const createWorkflow = useCallback(() => {
    if (busy || actionPending.current || readOnly || !capabilitiesReady) return;
    navigate(() => {
      setTab("definitions");
      setInstanceTarget({ workflowId: "", instanceId: "" });
      setCreating(true);
      setSelected("");
      setDefinition(undefined);
      setEditorEpoch((n) => n + 1);
      guard.current = null;
    });
  }, [busy, readOnly, capabilitiesReady, navigate]);
  const refreshWorkflow = useCallback(() => {
    navigate(() => {
      setRefresh((n) => n + 1);
      setEditorEpoch((n) => n + 1);
      guard.current = null;
    });
  }, [navigate]);
  function searchWorkflows() {
    setIndex(0);
    setQuery(keyword);
    setRefresh((n) => n + 1);
  }
  useEffect(() => {
    registerActions({
      connectionId,
      appId,
      create: createWorkflow,
      refresh: refreshWorkflow,
      createDisabled: busy || readOnly || !capabilitiesReady,
    });
    return () => registerActions(null);
  }, [registerActions, connectionId, appId, createWorkflow, refreshWorkflow, busy, readOnly, capabilitiesReady]);
  useEffect(() => {
    registerNavigation(navigate);
    return () => registerNavigation(null);
  }, [navigate, registerNavigation]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void invoke(connectionId, "powerjob/workflows", {
      appId,
      index,
      pageSize: 20,
      keyword: query,
    })
      .then((value) => {
        if (active) {
          setPage(value);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [connectionId, appId, index, query, refresh]);
  useEffect(() => {
    let active = true;
    void invoke(connectionId, "powerjob/workflowCapabilities", { appId })
      .then((value) => {
        if (active) {
          setReadOnly(value.readOnly);
          setCapabilitiesReady(true);
        }
      })
      .catch((e) => {
        if (active) {
          setReadOnly(true);
          setCapabilitiesReady(true);
          setError(String(e));
        }
      });
    return () => {
      active = false;
    };
  }, [connectionId, appId]);
  useEffect(() => {
    if (!selected || creating) return;
    let active = true;
    setDefinition(undefined);
    setLoading(true);
    void invoke(connectionId, "powerjob/workflow", {
      appId,
      workflowId: selected,
    })
      .then((row) => {
        if (active) {
          setDefinition(row);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [connectionId, appId, selected, creating, editorEpoch]);
  function openDefinition(id: string) {
    setError("");
    setMessage("");
    setSelected(id);
    setCreating(false);
    guard.current = null;
    setAction(null);
    setInstanceTarget({ workflowId: id, instanceId: "" });
  }
  const saved = useCallback(
    (row: WorkflowDefinition) => {
      setMessage(w("saved"));
      setPage((p) =>
        p ? { ...p, data: p.data.map((r) => (r.id === row.id ? row : r)) } : p,
      );
      setDefinition(row);
      if (row.id !== selected) {
        setCreating(false);
        setSelected(row.id);
        setRefresh((n) => n + 1);
      }
    },
    [selected, locale],
  );
  async function perform() {
    if (!actionWorkflow || !action || actionPending.current || readOnly) return;
    const target = action;
    actionPending.current = true;
    setBusy(true);
    setError("");
    try {
      if (target === "run") {
        if (!/^\d+$/.test(delay)) throw new Error(w("delay"));
        const result = await invoke(connectionId, "powerjob/runWorkflow", {
          appId,
          workflowId: actionWorkflow.id,
          initParams: params,
          delay,
        });
        if (mounted.current) {
          guard.current = null;
          setInstanceTarget({
            workflowId: actionWorkflow.id,
            instanceId: result.wfInstanceId,
          });
          setTab("instances");
        }
      } else if (target === "copy") {
        const result = await invoke(connectionId, "powerjob/copyWorkflow", {
          appId,
          workflowId: actionWorkflow.id,
        });
        if (mounted.current) {
          openDefinition(result.id);
          setRefresh((n) => n + 1);
        }
      } else if (target === "delete") {
        await invoke(connectionId, "powerjob/deleteWorkflow", {
          appId,
          workflowId: actionWorkflow.id,
        });
        if (mounted.current) {
          setSelected("");
          setDefinition(undefined);
          guard.current = null;
          setRefresh((n) => n + 1);
        }
      } else {
        const result = await invoke(
          connectionId,
          "powerjob/setWorkflowEnabled",
          {
            appId,
            workflowId: actionWorkflow.id,
            enabled: target === "enable",
          },
        );
        if (mounted.current) {
          setDefinition(result);
          setEditorEpoch((n) => n + 1);
          setPage((p) =>
            p
              ? {
                  ...p,
                  data: p.data.map((r) => (r.id === result.id ? result : r)),
                }
              : p,
          );
        }
      }
      if (mounted.current) {
        setAction(null);
        setMessage(w("requested"));
      }
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      actionPending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className="wf-workspace">
      {readOnly && <div className="wf-feedback">{w("readOnly")}</div>}
      {error && (
        <div role="alert" className="wf-feedback">
          {error}
        </div>
      )}
      {message && (
        <div role="status" className="wf-feedback">
          {message}
        </div>
      )}
      <div className="wf-definition-main">
        {listLayout.ready && (
          <ResizablePanelGroup
            orientation="horizontal"
            className="wf-definition-split"
            onLayoutChanged={listLayout.onLayoutChanged}
          >
            <ResizablePanel
              id="workflow-list-panel"
              minSize={240}
              defaultSize={listLayout.size ?? 250}
              panelRef={listLayout.panelRef}
              onResize={listLayout.onResize}
              groupResizeBehavior="preserve-pixel-size"
            >
              <aside className="wf-list">
                <div className="pane-bar">
                  <strong>{w("workflows")}</strong>
                  <div className="search-form" role="search">
                    <label htmlFor="workflow-keyword" className="sr-only">
                      {w("searchWorkflows")}
                    </label>
                    <Input
                      id="workflow-keyword"
                      type="search"
                      placeholder={w("searchWorkflows")}
                      maxLength={100}
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          searchWorkflows();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="xs"
                      variant="secondary"
                      onClick={searchWorkflows}
                    >
                      {w("search")}
                    </Button>
                  </div>
                </div>
                <div className="wf-list-rows" role="list" aria-label={w("workflows")}>
                  {page?.data.map((row) => (
                    <div className="job-item-wrap" role="listitem" key={row.id}>
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        className="job-item"
                        aria-pressed={selected === row.id}
                        aria-haspopup="menu"
                        aria-expanded={menu?.workflow.id === row.id}
                        title={`${row.wfName} · #${row.id} · ${t("jobContextHint")}`}
                        onClick={() => navigate(() => openDefinition(row.id))}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          openMenu(
                            row,
                            event.currentTarget,
                            event.clientX,
                            event.clientY,
                          );
                        }}
                        onKeyDown={(event) => {
                          if (
                            event.key === "ContextMenu" ||
                            (event.shiftKey && event.key === "F10")
                          ) {
                            event.preventDefault();
                            const rect =
                              event.currentTarget.getBoundingClientRect();
                            openMenu(
                              row,
                              event.currentTarget,
                              rect.left + 12,
                              rect.bottom,
                            );
                          }
                        }}
                      >
                        <span className="job-main">
                          <span className="job-name">{row.wfName}</span>
                          <span className="job-id">#{row.id}</span>
                        </span>
                        <span className="job-meta">
                          <span>
                            {[row.timeExpressionType, row.timeExpression]
                              .filter(Boolean)
                              .join(" · ") || t("noSchedule")}
                          </span>
                          <span
                            className={`job-enable-status job-enable-status--${row.enable ? "enabled" : "disabled"}`}
                          >
                            {t(row.enable ? "enabled" : "disabled")}
                          </span>
                        </span>
                      </Button>
                    </div>
                  ))}
                  {!page?.data.length && (
                    <p>{w(loading ? "loading" : "empty")}</p>
                  )}
                </div>
                <Pager page={page} onPage={setIndex} t={t} />
              </aside>
            </ResizablePanel>
            <ResizableHandle withHandle aria-label={w("resizeList")} />
            <ResizablePanel id="workflow-detail-panel" minSize={560}>
              <section className="wf-definition-detail">
                <div className="wf-detail-tabs detail-bar">
                  <div
                    role="tablist"
                    aria-label={w("workflows")}
                    className="wf-inline"
                  >
                    {(["definitions", "instances"] as const).map((mode) => (
                      <Button
                        type="button"
                        size="xs"
                        role="tab"
                        key={mode}
                        id={`workflow-tab-${mode}`}
                        aria-controls="workflow-tab-content"
                        aria-selected={tab === mode}
                        disabled={
                          mode === "instances" && (!selected || creating)
                        }
                        tabIndex={tab === mode ? 0 : -1}
                        onKeyDown={(event) => {
                          const keys = [
                            "ArrowLeft",
                            "ArrowRight",
                            "Home",
                            "End",
                          ];
                          if (!keys.includes(event.key)) return;
                          event.preventDefault();
                          const next =
                            event.key === "Home"
                              ? "definitions"
                              : event.key === "End"
                                ? "instances"
                                : mode === "definitions"
                                  ? "instances"
                                  : "definitions";
                          const target = document.getElementById(
                            `workflow-tab-${next}`,
                          ) as HTMLButtonElement | null;
                          if (target && !target.disabled) {
                            target.focus();
                            target.click();
                          }
                        }}
                        variant={tab === mode ? "default" : "secondary"}
                        onClick={() => {
                          if (tab !== mode)
                            navigate(() => {
                              guard.current = null;
                              setTab(mode);
                              setInstanceTarget({
                                workflowId: selected,
                                instanceId: "",
                              });
                            });
                        }}
                      >
                        {w(
                          mode === "definitions"
                            ? "orchestration"
                            : "instanceTab",
                        )}
                      </Button>
                    ))}
                  </div>
                  <strong>
                    {definition
                      ? `${definition.wfName} · #${definition.id}`
                      : w(creating ? "newWorkflow" : "select")}
                  </strong>
                </div>
                <div
                  id="workflow-tab-content"
                  role="tabpanel"
                  aria-labelledby={`workflow-tab-${tab}`}
                  className="wf-tab-content"
                >
                  {tab === "definitions" ? (
                    <>
                      {creating || definition ? (
                        <WorkflowEditor
                          key={`${creating ? "new" : definition?.id}:${editorEpoch}`}
                          definition={creating ? undefined : definition}
                          connectionId={connectionId}
                          appId={appId}
                          locale={locale}
                          t={t}
                          readOnly={readOnly || !capabilitiesReady}
                          onSaved={saved}
                          onGuard={(value) => {
                            guard.current = value;
                          }}
                        />
                      ) : (
                        <p className="wf-empty">
                          {w(loading ? "loading" : "select")}
                        </p>
                      )}
                    </>
                  ) : selected && !creating ? (
                    <WorkflowInstances
                      key={`${connectionId}:${appId}:${selected}:${instanceTarget.instanceId}`}
                      connectionId={connectionId}
                      appId={appId}
                      locale={locale}
                      t={t}
                      readOnly={readOnly || !capabilitiesReady}
                      workflowId={selected}
                      initialInstanceId={
                        instanceTarget.workflowId === selected
                          ? instanceTarget.instanceId
                          : ""
                      }
                      onBusyChange={(value) => {
                        actionPending.current = value;
                        setBusy(value);
                      }}
                    />
                  ) : (
                    <p className="wf-empty">{w("select")}</p>
                  )}
                </div>
              </section>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
      {menu && (
        <WorkflowContextMenu
          menu={menu}
          locale={locale}
          disabled={busy || readOnly || !capabilitiesReady}
          onClose={closeMenu}
          onAction={(kind, row) =>
            navigate(() => {
              if (selected !== row.id || creating) openDefinition(row.id);
              setActionWorkflow(row);
              setAction(kind);
              setParams("");
              setDelay("0");
            })
          }
        />
      )}
      {leave && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setLeave(null);
          }}
        >
          <DialogContent className="confirm-action-dialog">
            <DialogTitle>{w("discardTitle")}</DialogTitle>
            <p>{w("discardMessage")}</p>
            <div className="wf-inline">
              <Button
                type="button"
                size="xs"
                variant="secondary"
                onClick={() => setLeave(null)}
              >
                {w("keepEditing")}
              </Button>
              <Button
                type="button"
                size="xs"
                variant="secondary"
                onClick={() => {
                  const callback = leave;
                  setLeave(null);
                  guard.current = null;
                  callback();
                }}
              >
                {w("discard")}
              </Button>
              <Button
                type="button"
                size="xs"
                onClick={() => {
                  const callback = leave;
                  setLeave(null);
                  guard.current?.saveThen(callback);
                }}
              >
                {w("save")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {action === "run" && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !busy) setAction(null);
          }}
        >
          <DialogContent className="run-job-dialog">
            <DialogTitle>
              {w("run")} · {actionWorkflow?.wfName}
            </DialogTitle>
            <p>{w("runWarning")}</p>
            <label>
              {w("initParams")}
              <textarea
                rows={5}
                disabled={busy}
                value={params}
                onChange={(e) => setParams(e.target.value)}
              />
            </label>
            <label>
              {w("delay")}
              <Input
                type="number"
                min={0}
                disabled={busy}
                value={delay}
                onChange={(e) => setDelay(e.target.value)}
              />
            </label>
            {error && <p role="alert">{error}</p>}
            <div className="wf-inline">
              <Button
                type="button"
                size="xs"
                variant="secondary"
                disabled={busy}
                onClick={() => setAction(null)}
              >
                {w("cancel")}
              </Button>
              <Button
                type="button"
                size="xs"
                disabled={busy}
                onClick={() => void perform()}
              >
                {w("run")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {action && action !== "run" && (
        <ConfirmActionDialog
          title={`${w(action)} · ${actionWorkflow?.wfName ?? ""}`}
          message={w(
            action === "delete"
              ? "deleteWarning"
              : action === "copy"
                ? "copy"
                : "toggleWarning",
          )}
          confirmLabel={w("confirmAction")}
          busy={busy}
          destructive={action === "delete"}
          onConfirm={() => void perform()}
          onClose={() => setAction(null)}
          t={t}
        />
      )}
    </div>
  );
}
