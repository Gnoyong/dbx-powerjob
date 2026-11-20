# ADR 0002：使用 PowerJob 控制台 Web API

## 决策

沿用 PowerJob 控制台使用的接口路径，不调用 `/openApi`。

## 原因

当前功能需要控制台提供的任务、实例、日志和工作流能力；现有实现和测试以 PowerJob 5.1.2 为基线。

## 风险

控制台接口不是稳定公开契约。升级 PowerJob 必须按 [兼容性](../compatibility.md) 重新验证，并同步更新 [接口契约](../api-contract.md)。

