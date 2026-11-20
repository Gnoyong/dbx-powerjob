# 发布

## 发布前检查

1. 工作区干净，版本号符合递增规则。
2. `package.json`、`manifest.json`、`backend/main.go` metadata 和 tag 版本一致。
3. 运行 typecheck、build、Go 测试和相关 UI 测试。
4. 确认候选包包含 `assets/`、`ui/` 和 Go sidecar。
5. 记录本次兼容性验证和未完成的真实宿主验证。

## 本地打包

```powershell
pnpm install --frozen-lockfile
pnpm run build
$env:GOCACHE = Join-Path (Get-Location) 'backend/.go-cache'
node node_modules/@dbx-app/plugin-cli/bin/dbx-plugin.js package .
```

产物在 `dist/`。本地候选包未签名，验证时需要 DBX 的 Allow unsigned development packages。

## 仓库发布

- GitHub：发布 Release 或手动指定 Release tag，构建 Linux、Windows、macOS 的候选包及元数据。
- Gitea：推送 `v*` tag，由 Windows runner 构建并更新滚动的 `latest` Release。
- tag 去掉 `v` 后必须与两个清单文件的版本完全一致。
- Gitea 发布需要 Windows runner 和发布令牌；令牌不得写入仓库或调试日志。

正式分发仍需使用稳定的 publisher 和插件 ID，并经过 DBX Store 审核签名。候选包不等同于正式发布包。

