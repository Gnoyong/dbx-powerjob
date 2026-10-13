export type NodeKind = 1 | 2 | 3;
export type WorkflowNode = {
  nodeId: string;
  nodeType: NodeKind;
  jobId?: string | null;
  nodeName?: string;
  nodeParams?: string;
  enable?: boolean;
  skipWhenFailed?: boolean;
  instanceId?: string | null;
  status?: number;
  result?: string;
  disableByControlNode?: boolean;
  startTime?: string;
  finishedTime?: string;
};
export type WorkflowEdge = {
  from: string;
  to: string;
  property?: string;
  enable?: boolean;
};
export type WorkflowConfig = {
  wfName: string;
  wfDescription?: string;
  timeExpressionType: string;
  timeExpression?: string;
  maxWfInstanceNum: number;
  enable: boolean;
  notifyUserIds?: string[];
  lifeCycle?: { start?: number | null; end?: number | null } | null;
};
export type WorkflowDefinition = WorkflowConfig & {
  id: string;
  appId: string;
  fingerprint?: string;
  peworkflowDAG?: { nodes: WorkflowNode[]; edges: WorkflowEdge[] };
};
export type WorkflowInstance = {
  wfInstanceId: string;
  workflowId: string;
  workflowName?: string;
  status: number;
  wfInitParams?: string;
  wfContext?: string;
  result?: string;
  expectedTriggerTime?: string;
  actualTriggerTime?: string;
  finishedTime?: string;
  peworkflowDAG?: { nodes: WorkflowNode[]; edges: WorkflowEdge[] };
};
export type DraftNode = {
  key: string;
  nodeId?: string;
  nodeType: NodeKind;
  jobId?: string;
  nodeName: string;
  nodeParams: string;
  enable: boolean;
  skipWhenFailed: boolean;
  position?: { x: number; y: number };
};
export type WorkflowDraft = {
  id?: string;
  config: WorkflowConfig;
  nodes: DraftNode[];
  edges: WorkflowEdge[];
  fingerprint?: string;
};
export type SaveOperation = {
  operationId: string;
  workflowId: string;
  state:
    "running" | "succeeded" | "failed" | "partial" | "unknown" | "unverified";
  stage: "validating" | "nodes" | "saving" | "verifying";
  error?: string;
  nodeIds: Record<string, string>;
  definition?: WorkflowDefinition;
  updatedAt: number;
};
export type WorkflowActionResult = {
  success: boolean;
  verified?: boolean;
  instance?: WorkflowInstance;
};
