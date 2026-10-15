import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  applyNodeChanges,
  applyEdgeChanges,
  MarkerType,
  type Node,
  type NodeProps,
  type Edge,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import type { ReactNode } from "react";
import { getHost } from "../host";
import { statusLabel, statusTone } from "../format";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import type { Locale } from "../i18n";
import { hasCycle } from "./model";
import { workflowText } from "./i18n";
import type { DraftNode, WorkflowDraft, WorkflowNode } from "./types";

type FlowData = { node: DraftNode; runtime?: WorkflowNode; locale: Locale };
type FlowNode = Node<FlowData, "workflow">;
const WorkflowGraphNode = memo(function WorkflowGraphNode({
  data,
  selected,
}: NodeProps<FlowNode>) {
  const w = workflowText(data.locale);
  const n = data.node;
  const r = data.runtime;
  const tone = r ? statusTone(r.status, "NORMAL") : "unknown";
  return (
    <div
      className={`wf-node wf-node-${tone}${selected ? " wf-node-selected" : ""}`}
    >
      <Handle type="target" position={Position.Left} />
      <small>
        {w(
          n.nodeType === 2 ? "decision" : n.nodeType === 3 ? "nested" : "task",
        )}{" "}
        · {n.jobId ?? n.nodeId ?? "—"}
      </small>
      <strong>{n.nodeName || w(n.nodeType === 2 ? "decision" : "task")}</strong>
      <span>
        {r?.disableByControlNode
          ? w("controlled")
          : n.enable === false
            ? w("skipped")
            : r
              ? statusLabel(r.status, "NORMAL", data.locale)
              : ""}
      </span>
      {r?.result && <span title={r.result}>{r.result}</span>}
      {n.nodeType === 2 ? (
        <>
          <Handle
            id="true"
            type="source"
            position={Position.Right}
            style={{ top: "32%" }}
          />
          <label className="wf-port-true">Y</label>
          <Handle
            id="false"
            type="source"
            position={Position.Right}
            style={{ top: "72%" }}
          />
          <label className="wf-port-false">N</label>
        </>
      ) : (
        <Handle type="source" position={Position.Right} />
      )}
    </div>
  );
});
const nodeTypes = { workflow: WorkflowGraphNode };
export function arrangeDraft(
  draft: WorkflowDraft,
  direction: "LR" | "TB" = "LR",
): WorkflowDraft {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: direction, nodesep: 45, ranksep: 80 });
  draft.nodes.forEach((n) => graph.setNode(n.key, { width: 220, height: 96 }));
  draft.edges.forEach((e) => graph.setEdge(e.from, e.to));
  dagre.layout(graph);
  return {
    ...draft,
    nodes: draft.nodes.map((n) => {
      const p = graph.node(n.key);
      return { ...n, position: { x: p.x - 110, y: p.y - 48 } };
    }),
  };
}
export function WorkflowCanvas({
  draft,
  runtime,
  locale,
  editable,
  graphKey,
  onChange,
  onSelect,
  selectedKey,
  toolbar,
}: {
  draft: WorkflowDraft;
  runtime?: WorkflowNode[];
  locale: Locale;
  editable: boolean;
  graphKey: string;
  onChange?: (draft: WorkflowDraft, record?: boolean) => void;
  onSelect: (key: string) => void;
  selectedKey: string;
  toolbar?: ReactNode;
}) {
  const w = workflowText(locale);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [storageFailed, setStorageFailed] = useState(false);
  const flow = useRef<ReactFlowInstance<FlowNode, Edge> | null>(null);
  const loaded = useRef(false);
  const generation = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const positions = useRef<Record<string, { x: number; y: number }>>({});
  const viewport = useRef<Viewport | undefined>(undefined);
  const runtimeMap = useMemo(
    () => new Map(runtime?.map((n) => [n.nodeId, n])),
    [runtime],
  );
  const currentDraft = useRef(draft);
  currentDraft.current = draft;
  const storageKey = `local.powerjob.workflow.layout.v1:${graphKey}`;
  const [restored, setRestored] = useState(0);
  useEffect(() => {
    if (restored && viewport.current)
      void flow.current?.setViewport(viewport.current);
  }, [restored]);
  useEffect(() => {
    const epoch = ++generation.current;
    loaded.current = false;
    positions.current = {};
    viewport.current = undefined;
    async function restore() {
      try {
        const host = getHost();
        await host.ready;
        const raw = host.capabilities?.storage
          ? await host.storage?.get(storageKey)
          : undefined;
        if (epoch !== generation.current) return;
        if (raw && typeof raw === "object") {
          const value = raw as {
            positions?: Record<string, { x: number; y: number }>;
            viewport?: Viewport;
          };
          for (const [key, p] of Object.entries(value.positions ?? {}))
            if (p && Number.isFinite(p.x) && Number.isFinite(p.y))
              positions.current[key] = p;
          const v = value.viewport;
          if (v && [v.x, v.y, v.zoom].every(Number.isFinite) && v.zoom > 0)
            viewport.current = v;
        }
        setStorageFailed(false);
      } catch {
        if (epoch === generation.current) setStorageFailed(true);
      }
      if (epoch === generation.current) {
        loaded.current = true;
        setRestored((n) => n + 1);
      }
    }
    void restore();
    return () => {
      generation.current++;
      clearTimeout(saveTimer.current);
    };
  }, [storageKey]);
  useEffect(() => {
    if (!loaded.current) return;
    const fallback = arrangeDraft(draft);
    setNodes(
      draft.nodes.map((n, i) => ({
        id: n.key,
        type: "workflow",
        position:
          positions.current[n.key] ??
          n.position ??
          fallback.nodes[i]!.position!,
        selected: n.key === selectedKey,
        data: { node: n, runtime: runtimeMap.get(n.key), locale },
      })),
    );
    setEdges(
      draft.edges.map((e) => ({
        id: `${e.from}:${e.to}`,
        source: e.from,
        target: e.to,
        sourceHandle: e.property || undefined,
        label:
          e.property === "true"
            ? "Y"
            : e.property === "false"
              ? "N"
              : undefined,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: {
          stroke:
            e.enable === false
              ? "var(--color-muted-foreground,#929baa)"
              : e.property === "true"
                ? "#23835e"
                : e.property === "false"
                  ? "#bd4444"
                  : "var(--color-muted-foreground,#677282)",
          opacity: e.enable === false ? 0.4 : 1,
        },
        animated: runtimeMap.get(e.from)?.status === 3,
      })),
    );
  }, [draft, locale, runtimeMap, selectedKey, restored]);
  const persist = useCallback(() => {
    clearTimeout(saveTimer.current);
    const epoch = generation.current;
    saveTimer.current = setTimeout(() => {
      const instance = flow.current;
      if (!instance || !loaded.current || epoch !== generation.current) return;
      positions.current = Object.fromEntries(
        instance.getNodes().map((n) => [n.id, n.position]),
      );
      viewport.current = instance.getViewport();
      const value = {
        positions: positions.current,
        viewport: viewport.current,
      };
      void (async () => {
        try {
          const host = getHost();
          await host.ready;
          if (host.capabilities?.storage)
            await host.storage?.set(storageKey, value);
          if (epoch === generation.current) setStorageFailed(false);
        } catch {
          if (epoch === generation.current) setStorageFailed(true);
        }
      })();
    }, 350);
  }, [storageKey]);
  function layout(direction: "LR" | "TB") {
    const arranged = arrangeDraft(draft, direction);
    positions.current = Object.fromEntries(
      arranged.nodes.map((n) => [n.key, n.position!]),
    );
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        position: positions.current[n.id] ?? n.position,
      })),
    );
    onChange?.(arranged, false);
    requestAnimationFrame(() => {
      void flow.current?.fitView({ padding: 0.2, maxZoom: 1 });
      persist();
    });
  }
  return (
    <section className="wf-canvas-section" aria-label={w("definitions")}>
      <div className="wf-canvas-toolbar">
        {toolbar}
        <div className="wf-toolbar-group">
          <Button
            type="button"
            size="xs"
            variant="secondary"
            onClick={() => layout("LR")}
          >
            {w("layout")} · {w("horizontal")}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="secondary"
            onClick={() => layout("TB")}
          >
            {w("vertical")}
          </Button>
        </div>
        <Input
          aria-label={w("findNode")}
          placeholder={w("findNode")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const node = nodes.find(
                (n) =>
                  n.data.node.nodeName
                    .toLowerCase()
                    .includes(query.toLowerCase()) || n.id === query,
              );
              if (node) {
                onSelect(node.id);
                void flow.current?.fitView({
                  nodes: [node],
                  duration: 200,
                  maxZoom: 1,
                });
              }
            }
          }}
        />
      </div>
      {error && (
        <div role="alert" className="wf-feedback">
          {error}
        </div>
      )}
      {storageFailed && (
        <div role="alert" className="wf-feedback">
          {w("restoreLayout")}{" "}
          <Button type="button" size="xs" variant="ghost" onClick={persist}>
            {w("retry")}
          </Button>
        </div>
      )}
      <div className="workflow-canvas">
        <ReactFlow<FlowNode, Edge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          minZoom={0.15}
          maxZoom={2}
          nodesConnectable={editable}
          edgesReconnectable={false}
          deleteKeyCode={editable ? ["Delete", "Backspace"] : null}
          onInit={(instance) => {
            flow.current = instance;
            if (viewport.current) void instance.setViewport(viewport.current);
          }}
          onMoveEnd={persist}
          onNodeClick={(_, n) => onSelect(n.id)}
          onPaneClick={() => onSelect("")}
          onNodesChange={(changes) => {
            setNodes((prev) => applyNodeChanges(changes, prev));
            for (const change of changes)
              if (change.type === "position" && change.position)
                positions.current[change.id] = change.position;
            if (
              changes.some((c) => c.type === "position" && c.dragging === false)
            )
              persist();
            if (!editable) return;
            const removed = new Set(
              changes.filter((c) => c.type === "remove").map((c) => c.id),
            );
            if (removed.size)
              onChange?.({
                ...draft,
                nodes: draft.nodes.filter((n) => !removed.has(n.key)),
                edges: draft.edges.filter(
                  (e) => !removed.has(e.from) && !removed.has(e.to),
                ),
              });
            else if (
              changes.some((c) => c.type === "position" && c.dragging === false)
            )
              onChange?.(
                {
                  ...draft,
                  nodes: draft.nodes.map((n) => ({
                    ...n,
                    position: positions.current[n.key] ?? n.position,
                  })),
                },
                false,
              );
          }}
          onEdgesChange={(changes) => {
            setEdges((prev) => applyEdgeChanges(changes, prev));
            if (editable) {
              const removed = new Set(
                changes.filter((c) => c.type === "remove").map((c) => c.id),
              );
              if (removed.size)
                onChange?.({
                  ...draft,
                  edges: draft.edges.filter(
                    (e) => !removed.has(`${e.from}:${e.to}`),
                  ),
                });
            }
          }}
          onConnect={(c) => {
            if (!editable) return;
            const branch = c.sourceHandle ?? "";
            const edge = { from: c.source, to: c.target, property: branch };
            if (
              c.source === c.target ||
              draft.edges.some((e) => e.from === c.source && e.to === c.target)
            ) {
              setError(w("invalidEdge"));
              return;
            }
            if (
              branch &&
              draft.edges.some(
                (e) => e.from === c.source && e.property === branch,
              )
            ) {
              setError(w("decisionExits"));
              return;
            }
            if (
              hasCycle(
                draft.nodes.map((n) => n.key),
                [...draft.edges, edge],
              )
            ) {
              setError(w("cycle"));
              return;
            }
            setError("");
            onChange?.({ ...draft, edges: [...draft.edges, edge] });
          }}
        >
          <Background gap={20} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
    </section>
  );
}
