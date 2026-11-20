# RPC 与 PowerJob 接口契约

本插件调用 PowerJob 控制台 Web API，不调用 `/openApi`。这些路径属于控制台实现，升级 PowerJob 后必须重新验证。

## RPC 分组

| RPC | 作用 | 实现 |
| --- | --- | --- |
| `powerjob/users`, `apps`, `jobs`, `job`, `instances`, `instance`, `log` | 查询用户、应用、任务、实例和日志 | `backend/read.go` |
| `powerjob/latestJobInstances` | 当前任务页每个任务读取最新普通实例 | `backend/latest_instances.go` |
| `powerjob/createJob`, `copyJob`, `updateJob`, `setJobEnabled`, `deleteJob` | 任务写操作 | `backend/write.go` |
| `powerjob/runJob`, `retryFailedInstance`, `stopInstance` | 任务实例操作 | `backend/write.go` |
| `powerjob/workflowCapabilities`, `workflows`, `workflow`, `workflowInstances`, `workflowInstance` | 工作流查询 | `backend/workflow.go` |
| `powerjob/saveWorkflow`, `workflowSaveStatus` | 工作流分阶段保存和恢复 | `backend/workflow_save.go` |
| `powerjob/runWorkflow`, `setWorkflowEnabled`, `copyWorkflow`, `deleteWorkflow` | 工作流操作 | `backend/workflow.go` |

## 已验证的 PowerJob 路径

| PowerJob 路径 | 方法 | 说明 |
| --- | --- | --- |
| `/user/list` | GET | 通知用户列表 |
| `/appInfo/list` | POST | 应用分页 |
| `/job/list` | POST | 任务列表和详情 |
| `/instance/list` | POST | 普通/工作流实例分页 |
| `/instance/detailPlus` | POST | 实例详情 |
| `/instance/log` | GET | 分页日志 |
| `/workflow/fetch` | GET | 工作流定义或实例快照 |
| `/workflow/saveNode` | POST | 保存工作流节点 |
| `/workflow/save` | POST | 保存工作流定义和 DAG |

写操作的具体路径和字段必须以 `backend/write.go`、`backend/workflow.go` 的实现及测试为准。不要从 UI 传入任意 HTTP 路径；请求封装只允许 sidecar 内部固定路径。

## 通用规则

- `appId`、`jobId`、`instanceId`、`wfInstanceId`、`nodeId` 等 ID 在桥接层以字符串传递。
- 分页默认 `index=0`、`pageSize=20`；页大小范围为 1 到 100。
- 所有外部 ID 在发请求前校验为正的十进制数字。
- 任务关键字段由 sidecar 投影，避免把 PowerJob 返回的敏感或不稳定字段直接暴露给 UI。
- 未连接 session 时返回 `-32001`；参数错误返回 `-32602`；PowerJob 请求或响应错误返回 `-32000`。
- `latestJobInstances` 每次最多处理 20 个任务，单连接最多 4 个并发请求，整批超时 20 秒。

## 变更要求

新增 RPC 时必须同时更新 `frontend/host.ts` 的 `MethodResult`、Go 路由、参数校验、模拟服务测试和本文件。若 PowerJob 返回结果含大整数，必须保留字符串并增加回归测试。

