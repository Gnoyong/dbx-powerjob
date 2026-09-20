# DBX PowerJob 只读插件

基于 [DBX 插件开发规范](https://dbxio.com/en/docs/plugin-development) 的 Go sidecar + 工作台插件。当前版本 `0.1.2` 只查询 PowerJob 控制台使用的 Web API，不调用 PowerJob `/openApi`，也不提供启动、停止、修改或删除操作。

## 功能

| 工作台功能 | PowerJob Web API | HTTP 方法 |
| --- | --- | --- |
| 应用列表 | `/appInfo/list` | POST |
| 任务列表和详情 | `/job/list` | POST |
| 执行实例列表 | `/instance/list` | POST |
| 实例详情 | `/instance/detailPlus` | POST |
| 实例日志 | `/instance/log` | GET |

登录使用 `/auth/thirdPartyLoginDirect`，并通过 `/auth/ifLogin` 验证会话。这里的 POST 都是查询操作。sidecar 只暴露上述只读 RPC 方法，HTTP 路径在代码中固定；应用列表响应会过滤掉 `password` 等未展示字段。任务和实例 ID 以字符串传递，避免浏览器处理大整数时丢失精度。

## 使用

连接的默认主机是 `powerjob.prod.oceanwear.online`，端口为 `443`。在 DBX 中创建 PowerJob 连接，填写用户名、密码并测试连接，再从该连接打开「PowerJob 总览」。顶部切换应用；左栏选择任务，右栏的「任务详情」展示配置，「实例与日志」在上方展示该任务的实例，在下方按滚动位置自动加载选中实例的日志。实例表格也保留独立的实例详情入口。

该实例目前使用无法通过标准校验的 TLS 证书。连接表单中的「跳过 TLS 证书校验」必须由使用者显式启用，默认关闭。启用后通信仍使用 HTTPS，但客户端无法确认服务器身份；应仅在可信网络中使用。修复服务器证书后请关闭该选项。

PowerJob Web API 不是稳定公开契约。升级 PowerJob 后应重新验证登录响应、请求参数和返回字段。连接使用账号自身的权限；插件不会提升权限。

## 安装与签名

`dist/` 中的 `.dbxp` 是**未签名的审核候选包**。DBX 默认安装时会报 `Plugin package must have a trusted Ed25519 signature`，这是预期行为；该文件不能作为正式安装包分发。

- **仅用于本机开发验证**：在 DBX「插件中心」显式启用 **Allow unsigned development packages**，再导入本地 `.dbxp`。只对确认来源的本地候选包使用，测试后关闭该选项。此设置不会改变官方 Marketplace 的签名验证。
- **正式发布**：先确定稳定的插件 ID 和 publisher（当前 `local.powerjob.readonly` / `local` 是开发阶段占位值），把源码放入插件自己的 GitHub 仓库，创建版本标签和 Release。现有 `.github/workflows/plugin-release.yml` 会为支持的平台构建未签名候选包与 `release-candidates.json`。按 [DBX 官方发布流程](https://dbxio.com/en/docs/plugin-development#complete-official-marketplace-flow) 向 `t8y2/dbx-store` 提交候选信息；维护者审核后由受保护的 DBX Store 工作流签名，再下载签名后的包安装。插件作者不能自行获得官方私钥，也不能通过修改 Manifest 使当前候选包变成可信包。

当前目录尚未初始化 Git 仓库，也没有源码 Release，因此正式签名流程尚未开始。

## 开发与验证

使用官方 CLI（Node.js 22+、Go 1.22+）：

```powershell
pnpm dlx @dbx-app/plugin-cli dev --path . --port 5190
pnpm dlx @dbx-app/plugin-cli package .
```

调试器会把开发连接凭据明文保存在 `.dbx-dev/`，该目录已忽略，使用后应删除。仓库文件不包含实例密码。

核心只读接口测试可以运行：

```powershell
Set-Location backend
$env:GOCACHE = Join-Path (Get-Location) '.go-cache'
go test client.go read.go read_test.go
```

测试覆盖只读路径白名单、应用敏感字段过滤、JWT 请求头、大整数实例 ID 和请求前参数校验。完整 sidecar 构建由上述官方 CLI 打包命令验证。
