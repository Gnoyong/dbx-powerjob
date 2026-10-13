import type {
  DraftNode,
  WorkflowDefinition,
  WorkflowDraft,
  WorkflowInstance,
  WorkflowNode,
} from "./types";

export function definitionDraft(
  definition?: WorkflowDefinition,
): WorkflowDraft {
  return {
    id: definition?.id,
    fingerprint: definition?.fingerprint,
    config: definition
      ? {
          wfName: definition.wfName,
          wfDescription: definition.wfDescription ?? "",
          timeExpressionType: definition.timeExpressionType,
          timeExpression: definition.timeExpression ?? "",
          maxWfInstanceNum: definition.maxWfInstanceNum,
          enable: definition.enable,
          notifyUserIds: definition.notifyUserIds ?? [],
          lifeCycle: definition.lifeCycle ?? null,
        }
      : {
          wfName: "",
          wfDescription: "",
          timeExpressionType: "API",
          timeExpression: "",
          maxWfInstanceNum: 1,
          enable: false,
          notifyUserIds: [],
          lifeCycle: null,
        },
    nodes: (definition?.peworkflowDAG?.nodes ?? []).map((n) => ({
      key: n.nodeId,
      nodeId: n.nodeId,
      nodeType: n.nodeType ?? 1,
      jobId: n.jobId ?? undefined,
      nodeName: n.nodeName ?? "",
      nodeParams: n.nodeParams ?? "",
      enable: n.enable !== false,
      skipWhenFailed: n.skipWhenFailed === true,
    })),
    edges: (definition?.peworkflowDAG?.edges ?? []).map((e) => ({
      from: e.from,
      to: e.to,
      property: e.property ?? "",
    })),
  };
}
export function draftSignature(draft: WorkflowDraft): string {
  return JSON.stringify({
    config: draft.config,
    nodes: draft.nodes.map(({ position: _position, ...n }) => n),
    edges: draft.edges,
  });
}
export function draftErrors(d: WorkflowDraft): string[] {
  const errors: string[] = [];
  if (!d.config.wfName.trim()) errors.push("nameRequired");
  if (
    d.config.timeExpressionType === "CRON" &&
    !d.config.timeExpression?.trim()
  )
    errors.push("cronRequired");
  if (
    !Number.isInteger(d.config.maxWfInstanceNum) ||
    d.config.maxWfInstanceNum < 1
  )
    errors.push("concurrencyInvalid");
  const { start, end } = d.config.lifeCycle ?? {};
  if (
    (start != null && !Number.isFinite(start)) ||
    (end != null && !Number.isFinite(end)) ||
    (start != null && end != null && start >= end)
  )
    errors.push("lifecycleInvalid");
  if (d.config.notifyUserIds?.some((id) => !/^[1-9]\d{0,19}$/.test(id)))
    errors.push("notifyInvalid");
  if (!d.nodes.length || d.nodes.length > 500) errors.push("nodesRequired");
  const keys = new Set(d.nodes.map((n) => n.key));
  if (keys.size !== d.nodes.length) errors.push("duplicateNode");
  for (const n of d.nodes) {
    if (n.nodeType !== 2 && !/^[1-9]\d{0,19}$/.test(n.jobId ?? ""))
      errors.push("referenceRequired");
    if (n.nodeType === 2 && !n.nodeParams.trim()) errors.push("scriptRequired");
    if (n.nodeType === 3 && n.jobId === d.id) errors.push("selfReference");
    if (n.nodeType === 2) {
      const exits = d.edges.filter((e) => e.from === n.key);
      if (
        exits.length !== 2 ||
        !exits.some((e) => e.property === "true") ||
        !exits.some((e) => e.property === "false")
      )
        errors.push("decisionExits");
    }
  }
  const seen = new Set<string>();
  for (const e of d.edges) {
    const key = `${e.from}:${e.to}`;
    if (
      !keys.has(e.from) ||
      !keys.has(e.to) ||
      e.from === e.to ||
      seen.has(key)
    )
      errors.push("invalidEdge");
    seen.add(key);
    const source = d.nodes.find((n) => n.key === e.from);
    if (source?.nodeType !== 2 && e.property) errors.push("invalidEdge");
  }
  if (
    hasCycle(
      d.nodes.map((n) => n.key),
      d.edges,
    )
  )
    errors.push("cycle");
  return [...new Set(errors)];
}
export function hasCycle(
  keys: string[],
  edges: { from: string; to: string }[],
): boolean {
  const indegree = new Map(keys.map((k) => [k, 0]));
  const next = new Map<string, string[]>();
  for (const e of edges) {
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
    next.set(e.from, [...(next.get(e.from) ?? []), e.to]);
  }
  const queue = keys.filter((k) => indegree.get(k) === 0);
  let count = 0;
  for (let i = 0; i < queue.length; i++) {
    count++;
    for (const k of next.get(queue[i]!) ?? []) {
      indegree.set(k, indegree.get(k)! - 1);
      if (indegree.get(k) === 0) queue.push(k);
    }
  }
  return count !== keys.length;
}
export function canMarkSuccess(
  instance: WorkflowInstance,
  node?: WorkflowNode,
): boolean {
  return (
    (instance.status === 3 || instance.status === 10) &&
    node?.status === 4 &&
    !!node.instanceId &&
    node.skipWhenFailed !== true
  );
}
export function runtimeDraft(instance: WorkflowInstance): WorkflowDraft {
  return definitionDraft({
    id: instance.workflowId,
    appId: "",
    wfName: instance.workflowName ?? "",
    timeExpressionType: "API",
    maxWfInstanceNum: 1,
    enable: false,
    peworkflowDAG: instance.peworkflowDAG,
  });
}
export function newDraftNode(kind: 1 | 2 | 3): DraftNode {
  return {
    key: `draft-${crypto.randomUUID()}`,
    nodeType: kind,
    nodeName: "",
    nodeParams: "",
    enable: true,
    skipWhenFailed: false,
  };
}
