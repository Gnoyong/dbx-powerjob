import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "../host";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import { ConfirmActionDialog } from "../components/ConfirmActionDialog";
import { Pager } from "../components/Pager";
import type { Locale } from "../i18n";
import type { T } from "../uiTypes";
import type { Page } from "../types";
import { workflowText } from "./i18n";
import { WorkflowEditor, type EditorGuard } from "./WorkflowEditor";
import { WorkflowInstances } from "./WorkflowInstances";
import type { WorkflowDefinition } from "./types";

export default function WorkflowWorkspace({
  connectionId,
  appId,
  locale,
  t,
  registerNavigation,
}: {
  connectionId: string;
  appId: string;
  locale: Locale;
  t: T;
  registerNavigation: (guard: ((action: () => void) => void) | null) => void;
}) {
  const w = workflowText(locale);
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
    setSelected(id);
    setCreating(false);
    guard.current = null;
    setAction(null);
    setTab("definitions");
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
    if (!definition || !action || actionPending.current || readOnly) return;
    const target = action;
    actionPending.current = true;
    setBusy(true);
    setError("");
    try {
      if (target === "run") {
        if (!/^\d+$/.test(delay)) throw new Error(w("delay"));
        const result = await invoke(connectionId, "powerjob/runWorkflow", {
          appId,
          workflowId: definition.id,
          initParams: params,
          delay,
        });
        if (mounted.current) {
          guard.current = null;
          setInstanceTarget({
            workflowId: definition.id,
            instanceId: result.wfInstanceId,
          });
          setTab("instances");
        }
      } else if (target === "copy") {
        const result = await invoke(connectionId, "powerjob/copyWorkflow", {
          appId,
          workflowId: definition.id,
        });
        if (mounted.current) {
          openDefinition(result.id);
          setRefresh((n) => n + 1);
        }
      } else if (target === "delete") {
        await invoke(connectionId, "powerjob/deleteWorkflow", {
          appId,
          workflowId: definition.id,
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
          { appId, workflowId: definition.id, enabled: target === "enable" },
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
      <nav className="wf-inline wf-nav" aria-label={w("workflows")}>
        {(["definitions", "instances"] as const).map((mode) => (
          <Button
            type="button"
            size="xs"
            variant={tab === mode ? "default" : "secondary"}
            key={mode}
            onClick={() =>
              navigate(() => {
                guard.current = null;
                setTab(mode);
                setEditorEpoch((n) => n + 1);
                if (mode === "instances")
                  setInstanceTarget({ workflowId: selected, instanceId: "" });
              })
            }
          >
            {w(mode)}
          </Button>
        ))}
        {readOnly && <span>{w("readOnly")}</span>}
      </nav>
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
      {tab === "definitions" ? (
        <div className="wf-definition-main">
          <aside className="wf-list">
            <div className="wf-inline">
              <Input
                aria-label={w("search")}
                placeholder={w("search")}
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
                  setRefresh((n) => n + 1);
                }}
              >
                {w("search")}
              </Button>
            </div>
            <div className="wf-inline">
              <Button
                type="button"
                size="xs"
                disabled={busy || readOnly || !capabilitiesReady}
                onClick={() =>
                  navigate(() => {
                    setCreating(true);
                    setSelected("");
                    setDefinition(undefined);
                    setEditorEpoch((n) => n + 1);
                    guard.current = null;
                  })
                }
              >
                {w("newWorkflow")}
              </Button>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() =>
                  navigate(() => {
                    setRefresh((n) => n + 1);
                    setEditorEpoch((n) => n + 1);
                    guard.current = null;
                  })
                }
              >
                {w("refresh")}
              </Button>
            </div>
            <div className="wf-list-rows">
              {page?.data.map((row) => (
                <Button
                  type="button"
                  variant="ghost"
                  key={row.id}
                  className={`wf-list-item ${selected === row.id ? "active" : ""}`}
                  onClick={() => navigate(() => openDefinition(row.id))}
                >
                  <strong>{row.wfName}</strong>
                  <small>
                    #{row.id} · {w(row.enable ? "enabled" : "disable")}
                  </small>
                </Button>
              ))}
              {!page?.data.length && <p>{w(loading ? "loading" : "empty")}</p>}
            </div>
            <Pager page={page} onPage={setIndex} t={t} />
          </aside>
          <section className="wf-definition-detail">
            {definition && (
              <div className="wf-inline wf-definition-actions">
                {(
                  [
                    "run",
                    "copy",
                    definition.enable ? "disable" : "enable",
                    "delete",
                  ] as const
                ).map((kind) => (
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    disabled={busy || readOnly || !capabilitiesReady}
                    key={kind}
                    onClick={() =>
                      navigate(() => {
                        setAction(kind);
                        setParams("");
                        setDelay("0");
                      })
                    }
                  >
                    {w(kind)}
                  </Button>
                ))}
                <Button
                  type="button"
                  size="xs"
                  variant="secondary"
                  onClick={() =>
                    navigate(() => {
                      guard.current = null;
                      setInstanceTarget({
                        workflowId: definition.id,
                        instanceId: "",
                      });
                      setTab("instances");
                    })
                  }
                >
                  {w("instances")}
                </Button>
              </div>
            )}
            {creating || definition ? (
              <WorkflowEditor
                key={`${creating ? "new" : definition?.id}:${editorEpoch}`}
                definition={creating ? undefined : definition}
                connectionId={connectionId}
                appId={appId}
                locale={locale}
                readOnly={readOnly || !capabilitiesReady}
                onSaved={saved}
                onGuard={(value) => {
                  guard.current = value;
                }}
              />
            ) : (
              <p className="wf-empty">{w(loading ? "loading" : "select")}</p>
            )}
          </section>
        </div>
      ) : (
        <WorkflowInstances
          key={`${instanceTarget.workflowId}:${instanceTarget.instanceId}`}
          connectionId={connectionId}
          appId={appId}
          locale={locale}
          t={t}
          readOnly={readOnly || !capabilitiesReady}
          initialWorkflowId={instanceTarget.workflowId}
          initialInstanceId={instanceTarget.instanceId}
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
            <DialogTitle>{w("run")}</DialogTitle>
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
          title={w(action)}
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
