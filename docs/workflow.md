# 工作流实现

## 数据模型

工作流定义由基础配置、节点和边组成。当前画布支持任务节点、判断节点和嵌套工作流节点。边保存 `from`、`to` 和判断属性；判断节点的 `Y`、`N` 出口分别表示 true、false。

前端编辑模型位于 `frontend/workflow/model.ts` 和 `types.ts`，PowerJob 的 DAG 快照使用 `peworkflowDAG`。ID 在前后端转换时必须保持字符串，提交 PowerJob 时才转换为 JSON number。

## 保存阶段

保存一个已有工作流时按以下顺序执行：

1. 校验草稿、节点引用、配置和当前 fingerprint。
2. 通过 `/workflow/saveNode` 创建或更新节点，并记录本次操作取得的节点 ID。
3. 重新读取工作流，确认节点写入没有覆盖并发修改。
4. 通过 `/workflow/save` 提交配置和 DAG 边。
5. 通过 `/workflow/fetch` 回读，比较保存结果和草稿。

节点写入和工作流写入是两个 PowerJob 事务。后一步失败时，节点可能已经生效，因此保存操作会进入 `partial`、`unknown` 或 `unverified` 状态，而不会自动重发未知写入。

## 恢复规则

`workflowSaveStatus` 返回当前连接内的操作日志。页面刷新后可以根据 `operationId` 查询；sidecar 重启、断开重连或连接 ID 变化后日志不可恢复。继续保存前必须根据 PowerJob 控制台或回读结果确认已写入节点 ID。

- `partial`：已知部分写入成功，可以继续前先核对基线。
- `unknown`：写入结果未知，先到 PowerJob 检查，不能直接重发。
- `unverified`：提交可能成功，但回读校验失败，先比较当前定义。
- `succeeded`：提交并回读均匹配。

清除保存记录只清除 sidecar 内的日志，不会回滚 PowerJob 已写入的数据。

## 实例语义

工作流实例页只查询左侧选中的工作流，并展示当次运行的 DAG 快照。嵌套节点可以进入子实例后返回。标记节点成功只改变工作流节点状态，不会改变原任务实例结果；要继续执行通常需要重新重试工作流。停止子实例可能同时影响父工作流，操作后应重新查询实际状态。

