# 开发变更记录

## 维护规则

记录会影响开发、接口、宿主兼容性或发布流程的变化。用户可见功能的版本说明仍以项目发布说明为准。

## 0.1.32 基线

- 支持任务、实例、日志和工作流管理。
- 工作流保存包含节点写入、DAG 提交和回读确认阶段。
- 使用 DBX storage 保存应用选择和面板布局。
- 日志导出使用 DBX file transfer。
- 当前 PowerJob 接口契约基于 5.1.2。

## 未发布

- 统一版本维护入口为 `package.json.version`；`manifest.json` 和 `backend/version.go` 由 `scripts/sync-version.mjs` 生成并由 CI 校验。

