# 测试

## 测试层次

| 层次 | 入口 | 覆盖内容 |
| --- | --- | --- |
| Go 单元/契约 | `Push-Location backend; go test ./...` | 登录、请求、字段投影、ID、任务和工作流接口 |
| TypeScript 检查 | `pnpm run typecheck` | 类型和 RPC 返回值 |
| UI 静态契约 | `pnpm run test:tasks`、`pnpm run test:workflow` | 禁止原生提交/模态框、操作门、工作流交互 |
| 日志 | `pnpm run test:logs` | 分页、UTF-8、宿主保存和取消 |
| Host storage | `node --test scripts/host-storage.test.mjs` | ready 顺序、降级、写入排队和连接隔离 |
| UI 冒烟 | `node scripts/task-ui-smoke.cjs ...`、`node scripts/workflow-ui-smoke.cjs ...` | 受限 iframe、RPC 顺序、状态和错误恢复 |
| 构建 | `pnpm run build` | 单脚本 UI bundle 和可打包资源 |

## 修改后的最小验证

前端或宿主交互修改至少运行：

```powershell
pnpm run typecheck
pnpm run build
git diff --check
```

涉及任务操作运行 `pnpm run test:tasks`；涉及工作流运行 `pnpm run test:workflow`；涉及日志或文件保存运行 `pnpm run test:logs` 和对应 smoke；涉及 Go 请求运行 `go test ./...`。

## 真实宿主验证

模拟 PowerJob 和模拟 DBX bridge 只能验证契约和状态逻辑。只有在目标 DBX 宿主中实际连接 PowerJob、点击操作并确认 RPC 和结果时，才能声明端到端验证完成。测试记录应注明 PowerJob 版本、DBX 版本、连接权限和未覆盖能力。

