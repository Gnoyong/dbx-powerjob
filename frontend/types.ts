export type Page<T> = {
  index: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  data: T[];
};

export type AppInfo = {
  id: string;
  title?: string;
  appName?: string;
};

export type Job = {
  id: string;
  jobName?: string;
  enable?: boolean;
  timeExpressionType?: string;
  timeExpression?: string;
};

export type JobDetail = Record<string, unknown>;
export type InstanceType = "NORMAL" | "WORKFLOW";

export type Instance = {
  instanceId: string;
  status?: string | number;
  actualTriggerTime?: string | number;
  finishedTime?: string | number;
};

export type LogPage = {
  index: number;
  totalPages: number;
  data: string;
};
