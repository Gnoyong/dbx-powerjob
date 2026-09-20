# DBX PowerJob 工作台插件

基于 [DBX 插件开发规范](https://dbxio.com/en/docs/plugin-development) 的 Go sidecar + React/TypeScript 工作台插件。使用 PowerJob 控制台 Web API，不调用 `/openApi`。支持编辑任务配置、立即运行、启用/停用任务及重跑失败普通实例；其他功能只读。

## 功能

| 工作台功能 | PowerJob Web API | HTTP 方法 |
| --- | --- | --- |
| 应用列表 | `/appInfo/list` | POST |
| 任务列表和详情 | `/job/list` | POST |
| 执行实例列表 | `/instance/list` | POST |
| 实例详情 | `/instance/detailPlus` | POST |
| 实例日志 | `/instance/log` | GET |
| 立即运行任务 | `/job/run?jobId=…&appId=…&instanceParams=…` | GET |
| 停用任务 | `/job/disable` | GET |
| 启用任务 | `/job/list` → `/job/save`（保持任务完整配置，仅将 `enable` 改为 `true`） | POST → POST |
| 修改任务 | `/job/list` → `/job/save`（仅合并允许编辑的配置字段，并保存后复查） | POST → POST |
| 重跑失败普通实例 | `/instance/retry?instanceId=…&appId=…` | GET |

登录使用 `/auth/thirdPartyLoginDirect`，并通过 `/auth/ifLogin` 验证会话。sidecar 只暴露表中列出的 RPC 方法，HTTP 路径在代码中固定；运行及启停前重新查询目标的应用归属，启停还会确认当前状态并在接口成功后再次验证，失败实例仅支持普通任务。修改任务时仅接收允许的配置字段，重新获取完整配置、保存并复查。操作需要账号相应的 PowerJob WRITE/OPS 权限，界面会确认并显示结果。应用列表响应会过滤掉 `password` 等未展示字段。任务和实例 ID 以字符串传递，避免浏览器处理大整数时丢失精度。

## 使用

连接的默认主机是 `powerjob.prod.oceanwear.online`，端口为 `443`。在 DBX 中创建 PowerJob 连接，填写用户名、密码并测试连接，再从该连接打开「PowerJob 总览」。顶部切换应用；左栏任务用绿色“启用”和红色“停用”文本展示当前状态。右键任务可通过菜单运行、启用或停用（键盘可用 Shift+F10 或菜单键），启停前会弹出确认。运行弹窗可填写实例参数，留空也会发送空参数；成功后显示实例 ID 并打开「实例与日志」。右栏的「任务详情」可直接修改配置：生命周期通过日期范围日历选择日期并分别设置时间，以毫秒时间戳提交；告警、日志和高级运行配置使用对应的数值及选项控件，启用状态使用开关。发生改动后详情顶部出现保存按钮，也可用重置按钮撤销未保存的改动。停用仍调用 `/job/disable`。创建和修改时间以本地时间展示。「实例与日志」在上方展示该任务的实例，可按实例 ID、类型和状态筛选；该页签打开期间每 3 秒自动更新当前页，请求未完成时跳过本次轮询，在下方按滚动位置自动加载选中实例的日志。失败的普通任务实例可在表格中确认后重跑；实例表格也保留独立的实例详情入口。停用高频任务可能同时停止正在运行的实例；运行或重跑可能重复产生业务效果。

在 DBX 侧边栏右键已连接的 PowerJob 连接，可点「查看应用」。插件读取第一页最多 8 个应用名称，由 DBX 以提示消息显示；应用更多时提示总数，完整列表仍在「PowerJob 总览」中查看。DBX 的 `context-menu` 是静态菜单项，不支持把应用动态展开为子菜单。未连接时会提示先连接。

新建 DBX 连接默认可写。若沿用旧的「只读连接」，请在连接设置中取消勾选并重新连接；只读连接不会执行运行、启停或重跑。开发宿主已保存的连接若从文件修改了该设置，需要重启开发宿主后重新连接。

拖动任务栏与详情栏之间的分隔线可调整栏宽；聚焦分隔线后也可使用左右方向键微调，Home/End 调至边界。宿主允许本地存储时，刷新后会保留栏宽。

任务搜索支持点击 Search 或按回车提交。提交会回到第 1 页；翻页和刷新沿用最近一次提交的关键词，输入框中未提交的修改不会改变当前结果。

工作台支持中文和英文，跟随 DBX 当前语言自动切换；切换时保留已选任务、实例和已加载日志。Manifest 中的连接表单与工作台入口使用 DBX 的本地化字段，工作台内部使用随包提供的词典。

实例列表与详情中的状态数字按当前实例类型显示为中英文文字。普通任务与工作流的状态码分别依据 PowerJob 的 [InstanceStatus](https://github.com/PowerJob/PowerJob/blob/master/powerjob-common/src/main/java/tech/powerjob/common/enums/InstanceStatus.java) 和 [WorkflowInstanceStatus](https://github.com/PowerJob/PowerJob/blob/master/powerjob-common/src/main/java/tech/powerjob/common/enums/WorkflowInstanceStatus.java)；未知状态码保留原值。

该实例目前使用无法通过标准校验的 TLS 证书。连接表单中的「跳过 TLS 证书校验」必须由使用者显式启用，默认关闭。启用后通信仍使用 HTTPS，但客户端无法确认服务器身份；应仅在可信网络中使用。修复服务器证书后请关闭该选项。

PowerJob Web API 不是稳定公开契约。升级 PowerJob 后应重新验证登录响应、请求参数和返回字段。连接使用账号自身的权限；插件不会提升权限。

## 安装与签名

`dist/` 中的 `.dbxp` 是**未签名的审核候选包**。DBX 默认安装时会报 `Plugin package must have a trusted Ed25519 signature`，这是预期行为；该文件不能作为正式安装包分发。

- **仅用于本机开发验证**：在 DBX「插件中心」显式启用 **Allow unsigned development packages**，再导入本地 `.dbxp`。只对确认来源的本地候选包使用，测试后关闭该选项。此设置不会改变官方 Marketplace 的签名验证。
- **正式发布**：先确定稳定的插件 ID 和 publisher（当前 `local.powerjob.readonly` / `local` 是开发阶段占位值），把源码放入插件自己的 GitHub 仓库，创建版本标签和 Release。现有 `.github/workflows/plugin-release.yml` 会为支持的平台构建未签名候选包与 `release-candidates.json`。按 [DBX 官方发布流程](https://dbxio.com/en/docs/plugin-development#complete-official-marketplace-flow) 向 `t8y2/dbx-store` 提交候选信息；维护者审核后由受保护的 DBX Store 工作流签名，再下载签名后的包安装。插件作者不能自行获得官方私钥，也不能通过修改 Manifest 使当前候选包变成可信包。

当前仓库没有经过 DBX Store 签名的正式包，因此正式签名流程尚未完成。

## 开发与验证

使用 Node.js 22+、pnpm 11、Go 1.22+。`frontend/` 保存 React/TypeScript 源码，`ui/` 是 Vite 生成的静态文件，Manifest 仍以 `ui/index.html` 为入口。Vite 使用相对资源路径，运行时不依赖开发服务器或 CDN。

前端使用 shadcn/ui 的项目内组件结构，配置见 `components.json`，基础控件在 `frontend/components/ui/`。控件沿用 `frontend/style.css` 的现有尺寸、颜色和布局；Tailwind 只加载主题与工具类，不加载会重置页面元素的 Preflight。

```powershell
pnpm install --frozen-lockfile
pnpm run build
```

官方 CLI 的开发模式会调用 `dbx-plugin.toml` 中的 `ui_build` / `ui_watch`；正式候选包也应先构建前端：

```powershell
pnpm run dev
pnpm run build
pnpm dlx @dbx-app/plugin-cli package .
```

`pnpm run dev` 使用项目内的 DBX 插件 CLI 启动浏览器开发宿主，并将 Go 构建缓存放在已忽略的 `backend/.go-cache/`。开发宿主默认使用 5190 端口，若被占用会选择空闲端口。
`ui_watch` 只热更新前端。修改 `backend/` 中的 RPC 方法后，需要重启开发宿主；已安装的 DBX 插件还需要重新打包并安装新版本，否则前端可能报 `Method not found`。

`pnpm run typecheck` 可以单独检查 TypeScript。Release 工作流会先安装锁定依赖、构建前端，再调用 DBX 打包命令；该流程生成的候选包仍未签名。

调试器会把开发连接凭据明文保存在 `.dbx-dev/`，该目录已忽略，使用后应删除。仓库文件不包含实例密码。

核心接口测试可以运行：

```powershell
Set-Location backend
$env:GOCACHE = Join-Path (Get-Location) '.go-cache'
$env:GO111MODULE = 'off'
go test client.go read.go write.go read_test.go write_test.go
```

测试覆盖路径白名单、应用敏感字段过滤、JWT 请求头、大整数实例 ID、写入前目标校验和请求参数校验。此命令只测试不依赖 SDK 的 Go 文件；完整 sidecar 构建由官方 CLI 使用其随包 SDK 验证。测试不会连接生产 PowerJob 或执行实际写入。
