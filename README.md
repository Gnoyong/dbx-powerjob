<div align="center">
  <img src="assets/plugin.svg" alt="PowerJob 工作台图标" width="72" height="72" />

# DBX PowerJob 工作台

在 DBX 中管理 PowerJob 任务、查看执行实例与日志。

[使用](#使用) · [开发](#开发) · [打包与发布](#打包与发布)

</div>

基于 **React / TypeScript + Go sidecar**，通过 PowerJob 控制台 Web API 接入，不调用 `/openApi`。

## 功能

- **任务**：搜索、新建、复制、编辑、删除、运行和启停。
- **实例与日志**：实例筛选、失败普通实例重跑、日志跟随与导出。
- **工作台**：应用切换、中英文与主题适配、可调整面板布局。

## 使用

在 DBX「插件中心」导入 `.dbxp`，创建「PowerJob 连接」，填写主机、HTTPS 端口和账号，连接后打开「PowerJob 总览」。

- 主机不含协议、端口或路径；端口默认 `443`。
- 只读连接禁止写操作；更改只读设置后需重新连接。写操作需要 PowerJob 对应的 WRITE / OPS 权限。
- 「跳过 TLS 证书校验」默认关闭，仅供可信自签名环境使用。

> [!IMPORTANT]
> 本地和仓库工作流生成的是未签名候选包。本机验证需开启 **Allow unsigned development packages**；正式分发需经 DBX Store 审核签名。

任务操作位于右键菜单，配置编辑位于「任务详情」。运行中的实例可导出当前日志。停用高频任务可能同时停止正在执行的实例。

插件 ID `local.powerjob.readonly` 是保留的开发标识，当前已支持写操作。

## 开发

环境：**Node.js 22+、pnpm 11.9.0、Go 1.22+**。在 `powerjob-plugin/` 中执行：

```powershell
pnpm install --frozen-lockfile
pnpm run dev
```

开发端口为 **15190**，Go 缓存位于 `backend/.go-cache/`。前端自动重新构建；修改 Go RPC 后需重启开发宿主。

> [!CAUTION]
> 开发连接凭据明文保存在已忽略的 `.dbx-dev/`，使用后应清理。

### 检查与构建

```powershell
pnpm run build
git diff --check
```

`build` 包含 TypeScript 检查，输出前端资源到 `ui/`；单独类型检查可用 `pnpm run typecheck`。DBX 沙箱交互规范见 [AGENTS.md](AGENTS.md)。

核心接口测试（不依赖 DBX SDK，使用本地模拟服务）：

```powershell
Push-Location backend
try {
    $env:GOCACHE = Join-Path (Get-Location) '.go-cache'
    go test client.go read.go write.go read_test.go write_test.go
} finally {
    Pop-Location
}
```

完整 sidecar 由 DBX 插件 CLI 使用随包 SDK 构建。

### 目录

| 路径 | 内容 |
| --- | --- |
| `backend/` | Go sidecar、会话、接口及测试 |
| `frontend/` | React 工作台、组件与词典 |
| `scripts/` | 开发、构建和发布脚本 |
| `manifest.json` | 插件身份、连接字段与入口 |
| `dbx-plugin.toml` | 构建和打包配置 |
| `ui/` / `dist/` | 生成的前端资源 / 候选包，不入库 |

## 打包与发布

### 本地打包

```powershell
pnpm run build
$env:GOCACHE = Join-Path (Get-Location) 'backend/.go-cache'
node node_modules/@dbx-app/plugin-cli/bin/dbx-plugin.js package .
```

输出位于 `dist/`，也可运行 VS Code 默认构建任务「打包 DBX 插件」。

### 仓库发布

| 平台 | 触发方式 | 产物 |
| --- | --- | --- |
| Gitea | 推送 `v*` 标签 | Windows 候选包，更新滚动的 `latest` Release，保留版本标签 |
| GitHub | 发布 Release 或手动指定 Release 标签 | Linux、Windows、macOS 的 x64 / arm64 候选包及元数据 |

标签版本必须与 `package.json`、`manifest.json` 一致。Gitea 需要 Windows runner 和发布令牌。

VS Code「发布新版本」任务要求干净工作区及递增的 `x.y.z` 版本号，会更新版本、提交、创建标签并原子推送到 `origin`。

正式发布前需确定稳定的插件 ID 和 publisher，并按 [DBX 官方发布流程](https://dbxio.com/en/docs/plugin-development#complete-official-marketplace-flow)提交候选包审核签名。

## 兼容性与排错

PowerJob 控制台 Web API 不是稳定公开契约，升级后需验证登录和接口兼容性。

| 问题 | 处理 |
| --- | --- |
| `Method not found: powerjob/...` | 重启开发宿主；已安装插件需重新打包并安装递增版本 |
| 写操作提示只读 | 修改连接设置并重新连接；直接修改开发连接文件后需重启宿主 |
| `allow-forms` / `allow-modals` | 按 [AGENTS.md](AGENTS.md)检查原生表单提交和弹窗 |
