# ADR 0001：通过 Go sidecar 访问 PowerJob

## 决策

UI 只调用 DBX bridge；所有 PowerJob HTTP 请求、登录和字段投影放在 Go sidecar。

## 原因

这样可以集中处理会话、超时、ID 精度、输入校验和敏感字段，并避免受限 iframe 直接访问 PowerJob。

## 影响

新增功能需要同时维护前端 RPC 类型、Go 路由和契约测试。sidecar 重启会丢失连接 session 和工作流保存日志。

