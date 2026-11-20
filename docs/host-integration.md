# DBX 宿主集成

## Bridge

宿主通过 `window.dbxPlugin` 提供 `ready`、`invoke`、`storage`、`fileTransfer` 和上下文回调。所有调用都应等待 `host.ready`，并通过 `frontend/host.ts` 的封装完成类型和超时处理。

## iframe 限制

UI 运行在受限 `srcdoc` iframe 中：

- 构建产物必须是单个 JavaScript 文件，Vite 保持 `inlineDynamicImports: true`。
- 不能依赖 HTTP 加载的额外脚本或动态分包。
- 不使用 `alert`、`confirm`、`prompt`。
- 不依赖 `allow-forms` 或 `allow-modals`；业务按钮使用显式 `type="button"` 和 React 事件。
- 用户反馈使用页面状态或 Sonner Toast，确认操作使用项目 Dialog。

## Storage

manifest 声明 `host.storage` 权限。当前使用场景包括连接范围内的应用选择、任务栏宽度、日志区域高度和工作流面板布局。键应带插件前缀，连接相关数据必须包含 connection ID。宿主不支持 storage 时使用默认值；读写失败应保留当前页面状态并提供重试。

面板尺寸写入按 key 排队，读取会等待之前的写入完成。不要使用浏览器 `localStorage` 作为替代方案。

## 日志导出

日志导出使用 `fileTransfer.beginSave`、分块 `write`、`finish`。每次写入必须检查 `written` 和 `nextOffset`；用户取消、上下文切换或写入失败时调用 `cancel`。不能用浏览器下载链接替代宿主文件保存。

## 上下文切换

连接、应用、任务或工作流切换时，应清除旧对话框和待确认操作，并使旧异步请求失效。前端成功回调不能证明后端 RPC 已成功，错误展示必须区分本地校验、宿主 bridge 错误和 PowerJob 错误。

