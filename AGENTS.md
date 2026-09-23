# PowerJob 插件开发规范

本文件适用于 `powerjob-plugin/` 下的所有改动。

## DBX 沙箱交互兼容规范

PowerJob 插件前端运行在受限的 DBX iframe 中。不得假设宿主提供
`allow-forms` 或 `allow-modals` 权限。任何用户操作都必须在缺少这两个
权限时正常工作。

### 禁止使用浏览器原生模态 API

- 禁止调用 `alert()`、`confirm()`、`prompt()` 及其 `window.*` 形式。
- 需要用户确认时，使用项目内受控的 `Dialog` 组件。
- 确认对话框必须包含可访问的标题、操作说明、取消按钮和确认按钮。
- 取消、Escape 和关闭对话框不得执行目标操作。
- 校验错误、RPC 错误、成功状态和加载状态使用页面内状态或项目反馈组件展示，不得使用原生弹窗。

### 禁止触发原生表单提交

- 禁止使用 `type="submit"`、`HTMLFormElement.submit()` 或
  `HTMLFormElement.requestSubmit()` 触发业务操作。
- 表单内所有 `Button` 和原生 `button` 必须显式声明 `type="button"`。
- 保存、创建、搜索等操作应由 `onClick` 直接调用 React 事件处理函数。
- 校验和数据组装逻辑必须提取成可直接调用的函数，不能依赖浏览器完成表单提交。
- 如需保留 `<form onSubmit>` 以支持受控的程序化事件，处理器必须首先调用
  `event.preventDefault()`，随后调用同一业务函数；不得把它作为按钮的主要触发路径。
- 跨组件触发时，优先通过回调传递业务函数。只有现有组件边界无法直接传递回调时，
  才允许派发 `bubbles: true, cancelable: true` 的 `submit` 事件，并且目标
  `onSubmit` 必须同步执行 `preventDefault()`。不得派发不可取消事件。

### 实现要求

- 使用项目已有的 `frontend/components/ui` 包装组件和 `frontend/style.css`，
  不得为了修复沙箱问题替换现有视觉体系。
- 异步操作开始前应阻止重复点击；完成或失败后必须恢复可操作状态。
- 切换连接、应用或任务时，应清理尚未确认的对话框状态，防止对旧上下文执行操作。
- 前端修复不能作为后端 RPC 已成功的证据；错误展示必须区分前端阻断和 RPC 失败。

### 修改前检查

涉及按钮、表单、对话框或用户确认流程时，先运行：

```powershell
rg -n '\b(window\.)?(alert|confirm|prompt)\s*\(' frontend
rg -n 'type="submit"|requestSubmit\s*\(|\.submit\s*\(' frontend
rg -n '<form|onSubmit|form="[^"]+"' frontend
```

发现命中后必须逐项确认是否会触发浏览器原生行为。新增或修改的表单区域还必须检查：

- 每个按钮是否显式声明 `type="button"`。
- 点击入口是否直接到达业务处理函数。
- 取消操作是否不会发出 RPC。
- 忙碌状态是否阻止重复提交。

### 回归要求

修复此类问题时，必须先建立能命中具体问题的静态检查或 UI 测试，并观察其失败；
修复后用同一检查确认通过。至少运行：

```powershell
pnpm typecheck
pnpm build
git diff --check
```

前端改动完成后还应重新打包一个递增版本，供已安装插件替换验证：

```powershell
node node_modules/@dbx-app/plugin-cli/bin/dbx-plugin.js package .
```

只有在目标 DBX 宿主中实际点击并确认 RPC 成功后，才能声明端到端验证完成。
静态检查、生产构建和打包成功只能证明源码与候选包验证通过。

### 常见故障定位

- 控制台出现 `Blocked form submission ... allow-forms`：检查原生 submit 按钮、
  隐式 submit 按钮、`form` 属性、`submit()` 和 `requestSubmit()`。
- 控制台出现 `Ignored call to 'confirm()' ... allow-modals`：移除原生确认框，
  改用项目内受控 `Dialog`。
- 点击后没有沙箱日志但没有 RPC：检查 React 回调绑定、校验提前返回和忙碌状态。
- RPC 报 `Method not found`：前端代码可能已更新但 Go sidecar 仍是旧版本；重启开发宿主，
  或重新打包并安装递增版本。

### 完成定义

- 前端不存在原生 `alert`、`confirm`、`prompt` 调用。
- 前端不存在业务按钮触发的原生表单提交。
- 相关按钮、取消路径、忙碌状态和错误路径均已检查。
- `pnpm typecheck`、`pnpm build`、`git diff --check` 均通过。
- 已明确说明是否完成真实 DBX/PowerJob 运行时验证。
