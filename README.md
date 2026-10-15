<div align="center">
  <img src="assets/plugin.svg" alt="PowerJob 工作台图标" width="72" height="72" />

# DBX PowerJob 工作台

在 DBX 中管理 PowerJob 任务、查看执行实例与日志。

[使用](#使用) · [开发](#开发) · [打包与发布](#打包与发布)

</div>

基于 **React / TypeScript + Go sidecar**，通过 PowerJob 控制台 Web API 接入，不调用 `/openApi`。

## 功能

- **任务**：搜索、新建、复制、编辑、删除、运行和启停。
- **最新实例状态**：任务列表异步展示每个任务的最新普通实例状态，可见时每 30 秒刷新；运行或重试后立即刷新对应任务。
- **实例与日志**：实例筛选、失败普通实例重跑、日志跟随与导出。
- **工作流编排**：三类节点、判断分支、自动布局、撤销重做、配置校验和分阶段保存。
- **工作流实例**：按选中工作流查询、运行 DAG、节点日志与详情、父子实例导航、停止、重试和节点标记成功。
- **工作台**：应用切换、中英文与主题适配、可调整面板布局。

任务栏宽度和日志区域高度通过 DBX `storage` 保存，插件声明 `host.storage` 权限。
读取完成后再初始化面板；宿主不支持该能力时使用默认布局，读写失败时提供重试。
DBX 沙箱没有可用的 `localStorage`，旧版本在沙箱中未能保存的尺寸无法恢复。

操作结果、日志导出结果和布局存储错误使用 Sonner Toast，支持 DBX 主题和语言。
加载状态和表单校验保留在原位置。`dbxPlugin.notify(method, params)` 是发送给插件后端的
JSON-RPC 通知，不是宿主 Toast 接口，因此不能用它替代用户提示。

## 使用

在 DBX「插件中心」导入 `.dbxp`，创建「PowerJob 连接」，填写主机、HTTPS 端口和账号，连接后打开「PowerJob 总览」。

- 主机不含协议、端口或路径；端口默认 `443`。
- 只读连接禁止写操作；更改只读设置后需重新连接。写操作需要 PowerJob 对应的 WRITE / OPS 权限。
- 「跳过 TLS 证书校验」默认关闭，仅供可信自签名环境使用。

> [!IMPORTANT]
> 本地和仓库工作流生成的是未签名候选包。本机验证需开启 **Allow unsigned development packages**；正式分发需经 DBX Store 审核签名。

任务操作位于右键菜单，配置编辑位于「任务详情」。运行中的实例可导出当前日志。停用高频任务可能同时停止正在执行的实例。

插件 ID `local.powerjob.readonly` 是保留的开发标识，当前已支持写操作。

### 工作流

顶部切换到「工作流」，在左侧选择流程，在详情的「编排」页签点击「编辑」。添加任务、判断或嵌套工作流节点后，
拖动右侧出口到目标节点的左侧入口建立依赖；判断节点的 Y / N 分别对应 true / false。
选中连线或节点后按 Delete 删除；Ctrl+Z / Ctrl+Y 撤销或重做（输入框内保留文本快捷键）。
任务及嵌套工作流选择器支持搜索和分页。新流程默认禁用，调度支持 API / CRON；通知用户填写用户 ID。

详情的「实例」页签只查询左侧选中的工作流，支持实例 ID、状态筛选和分页，展示当次运行的 DAG 快照。
运行成功后自动切到实例页签并选中新实例；切换工作流会清空实例筛选与选择，离开实例页签停止轮询。
任务节点可查看日志和详情，嵌套节点可进入子实例后返回。
拖动列表与详情、编排画布与属性面板之间的分隔条可调整宽度，宿主存储会记住调整结果；分隔条也支持键盘方向键。
标记成功仅改变工作流节点，不改变原任务实例结果；需要另行重试工作流才能继续执行。
停止子实例可能同时停止父工作流，停止后应核对任务的实际执行情况。

保存依次显示校验、节点保存、DAG 提交和回读确认。PowerJob 5.1.2 的节点与流程写入是两个事务：
后一步失败时，节点配置可能已生效。「继续保存 / 回读确认」复用已确认的节点 ID；
写入结果未知时不会自动重发，请先到 PowerJob 控制台核对，再清除保存记录、重新读取或重建草稿。
清除记录不会回滚已写入的节点。并发编辑检查不能代替服务端事务或并发锁。

保存操作记录保留在当前连接会话内，页面刷新可以恢复进度，断开重连或 sidecar 重启后记录失效。
画布布局和操作 ID 使用 DBX storage；宿主不支持 storage 时仅保留当前页面状态。

契约基于 PowerJob 5.1.2。新增能力的自动检查使用模拟 PowerJob 和模拟 DBX bridge，不能代替目标宿主实际验证。

最新实例读取沿用控制台 `/instance/list` 的 `gmtModified DESC` 顺序，每个任务取第一条。
仅查询当前页最多 20 个任务，每连接最多 4 个并发请求，整批超时 20 秒。
轮询失败保留已展示的状态并标记更新失败，刷新间隔退避至最长 120 秒；切换工作台或页面隐藏时暂停。

## 开发

环境：**Node.js 22+、pnpm 11.9.0、Go 1.22+**。在 `powerjob-plugin/` 中执行：

```powershell
pnpm install --frozen-lockfile
pnpm run dev
```

开发端口为 **15190**，Go 缓存位于 `backend/.go-cache/`；Windows 开发启动器自动将临时目录设为项目内的 `.dbx-dev/tmp/`，避免系统 Temp 权限导致构建失败。前端自动重新构建；修改 Go RPC 后需重启开发宿主。

> [!CAUTION]
> 开发连接凭据明文保存在已忽略的 `.dbx-dev/`，使用后应清理。

### 检查与构建

```powershell
pnpm run build
node --test scripts/host-storage.test.mjs scripts/toast.test.mjs
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
