# 排错

| 现象 | 检查 |
| --- | --- |
| `Method not found` | 重启开发宿主，确认 UI 和 Go sidecar 来自同一次构建；检查 `backend/main.go` 路由。 |
| `allow-forms` | 搜索隐式 submit、`type="submit"`、`submit()` 和 `requestSubmit()`。 |
| `allow-modals` | 搜索 `alert`、`confirm`、`prompt`，改用项目 Dialog。 |
| 写操作显示只读 | 检查连接设置和 PowerJob WRITE/OPS 权限；修改只读设置后重新连接。 |
| 登录失败 | 检查 host 不含协议、端口或路径；确认 HTTPS 端口、账号和 TLS 设置。 |
| 日志导出不可用 | 检查宿主是否声明 `fileTransfer.beginSave`，以及写入确认的 offset。 |
| 工作流保存为 `unknown` | 不要重试；先在 PowerJob 控制台核对节点和流程，再查询保存状态或重建草稿。 |
| 工作流保存为 `partial` | 核对已保存节点 ID 和当前 fingerprint，再继续保存。 |
| 状态轮询停止 | 检查页面是否隐藏、是否切换了工作台/连接，以及是否触发退避上限。 |
| 大 ID 变成错误数字 | 确认 Go 解码使用 `UseNumber`，TypeScript 类型和 JSON 参数均使用字符串。 |

排错时先保留原始错误消息和 PowerJob 返回状态码，避免把前端校验失败误判为后端写入失败。

