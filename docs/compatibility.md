# 兼容性

| 组件 | 当前基线 | 验证重点 |
| --- | --- | --- |
| PowerJob | 5.1.2 | 控制台 Web API、登录、任务和工作流保存 |
| DBX Host API | 1 | connection、storage、file transfer、iframe CSP |
| Node.js | 22+ | Vite、脚本和测试运行时 |
| pnpm | 11.9.0 | lockfile 和构建依赖 |
| Go | 1.22+ | sidecar SDK 和 JSON 编解码 |

PowerJob 控制台 Web API 不是稳定的公开契约。升级 PowerJob 后至少检查登录、应用列表、任务读写、实例/日志、工作流读取、节点保存、DAG 保存和回读确认。

DBX Host API 升级后检查 `window.dbxPlugin` 的 ready 顺序、storage 能力声明、文件传输确认值和受限 iframe 行为。若宿主不支持 storage 或 file transfer，功能应按 [宿主集成](host-integration.md) 降级。

