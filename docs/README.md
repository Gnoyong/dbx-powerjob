# 开发文档

本文档面向维护 DBX PowerJob 插件的开发者。项目根目录的 [README](../README.md) 负责安装、使用和最短开发流程；本目录记录实现约束、接口契约和发布操作。

## 按任务阅读

| 目标 | 文档 |
| --- | --- |
| 理解代码如何协作 | [架构](architecture.md) |
| 配置本地环境并调试 | [开发指南](development.md) |
| 修改 RPC 或 PowerJob 请求 | [接口契约](api-contract.md) |
| 修改工作流画布或保存逻辑 | [工作流](workflow.md) |
| 修改 DBX bridge、存储或日志导出 | [宿主集成](host-integration.md) |
| 增加或运行测试 | [测试](testing.md) |
| 打包和发布 | [发布](release.md) |
| 判断升级风险 | [兼容性](compatibility.md) |
| 定位运行时问题 | [排错](troubleshooting.md) |
| 处理凭据、TLS 和敏感数据 | [安全](security.md) |

## 文档约定

- RPC 方法、PowerJob 路径和 JSON 字段使用代码中的原名。
- ID 以字符串记录，避免 JavaScript 精度丢失。
- 标注“已验证”的行为来自当前测试或 PowerJob 5.1.2 实例；未验证行为不能当作稳定 API。
- 修改接口、保存流程、宿主能力或发布流程时，同步更新对应文档和 [变更记录](changelog.md)。

