# 开发指南

## 环境

- Node.js 22+
- pnpm 11.9.0
- Go 1.22+
- PowerJob 5.1.2 用于当前接口契约验证

在 `powerjob-plugin/` 中执行：

```powershell
pnpm install --frozen-lockfile
pnpm run dev
```

开发 UI 端口为 `15190`。Windows 启动器使用项目内 `.dbx-dev/tmp/`；Go 构建缓存可放在 `backend/.go-cache/`。修改 Go RPC 后需要重启开发宿主。

## 常用命令

```powershell
pnpm run typecheck
pnpm run build
pnpm run test:tasks
pnpm run test:logs
pnpm run test:workflow
node --test scripts/host-storage.test.mjs scripts/toast.test.mjs
git diff --check
```

Go 核心接口测试：

```powershell
Push-Location backend
try {
  $env:GOCACHE = Join-Path (Get-Location) '.go-cache'
  go test ./...
} finally { Pop-Location }
```

## 调试顺序

先确认 `pnpm run typecheck` 和 `pnpm run build`，再运行相关契约或 UI 冒烟测试。RPC 问题先看 sidecar 日志和 `backend/main.go` 路由；界面问题再检查 `frontend/host.ts` 的参数、上下文和 toast。真实 DBX 宿主验证应记录在变更说明中。

开发连接凭据会明文保存在被忽略的 `.dbx-dev/`，结束调试后清理该目录。

## 修改表单或操作按钮前

按仓库规范检查原生模态框、原生提交、隐式 submit 按钮和重复点击路径：

```powershell
rg -n '\b(window\.)?(alert|confirm|prompt)\s*\(' frontend
rg -n 'type="submit"|requestSubmit\s*\(|\.submit\s*\(' frontend
rg -n '<form|onSubmit|form="[^"]+"' frontend
```

