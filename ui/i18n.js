(() => {
  "use strict";

  const dictionaries = {
    en: {
      title: "PowerJob Read Only", app: "Application", previousApp: "Previous applications", nextApp: "Next applications",
      readonly: "Read only", refresh: "Refresh", jobList: "Job list", resizeJobsPane: "Resize job list", jobs: "Jobs", jobKeyword: "Job keyword",
      searchJobs: "Search jobs", search: "Search", previous: "Previous", next: "Next", jobWorkspace: "Job workspace",
      selectJob: "Select a job on the left", jobInfo: "Job information", jobDetail: "Job details", runsAndLogs: "Instances & logs",
      selectJobDetail: "Select a job on the left to view details", selectJobInstances: "Select a job on the left to view instances",
      jobInstances: "Job instances", instanceId: "Instance ID",
      instanceType: "Instance type", normalJob: "Normal job", workflow: "Workflow", status: "Status",
      triggeredAt: "Triggered at", finishedAt: "Finished at", instanceLogs: "Instance logs", retry: "Retry",
      selectInstanceLog: "Select an instance above to view logs", loadMore: "Load more", instanceDetail: "Instance details",
      close: "Close", loading: "Loading…", loadingJobs: "Loading jobs…", loadingDetail: "Loading job details…",
      loadingInstances: "Loading instances…", loadingLogs: "Loading logs…", noSchedule: "No schedule information",
      enabled: "Enabled", disabled: "Disabled", yes: "Yes", no: "No", total: "{count} total",
      noJobs: "No matching jobs", noInstances: "No matching instances", noApps: "No accessible applications",
      noAccessibleJobs: "No accessible jobs", unavailable: "Connection unavailable", selectConnection: "Select a connection first",
      openFromConnection: "Open the workbench from a DBX connection first.", jobsFailed: "Failed to load jobs",
      appsFailed: "Failed to load applications", detailFailed: "Failed to load job details",
      instancesFailed: "Failed to load instances", logFailed: "Failed to load logs",
      instanceDetailFailed: "Failed to load instance details", hostFailed: "Failed to initialize the DBX plugin host",
      viewRuns: "Open ‘Instances & logs’ to view instances", noLogs: "This instance has no logs",
      logPage: "{current} / {total} pages", logComplete: "All logs loaded", detail: "Details",
      instanceTitle: "Instance {id}", instanceWaitingDispatch: "Waiting for dispatch",
      instanceWaitingWorker: "Waiting for worker", instanceRunning: "Running", instanceFailed: "Failed",
      instanceSucceeded: "Succeeded", instanceCanceled: "Canceled", instanceStopped: "Stopped manually",
      workflowWaiting: "Waiting for scheduling", jobId: "Job ID", jobName: "Job name", description: "Description",
      appId: "Application ID", timeExpressionType: "Schedule type", timeExpression: "Schedule expression",
      executeType: "Execution type", processorType: "Processor type", processorInfo: "Processor",
      jobParams: "Job parameters", nextTriggerTimeStr: "Next trigger", maxInstanceNum: "Max instances",
      concurrency: "Concurrency", instanceTimeLimit: "Instance timeout", instanceRetryNum: "Instance retries",
      taskRetryNum: "Task retries", dispatchStrategy: "Dispatch strategy", designatedWorkers: "Designated workers",
      maxWorkerCount: "Max workers", lifeCycle: "Lifecycle", alarmConfig: "Alarm configuration",
      logConfig: "Log configuration", advancedRuntimeConfig: "Advanced runtime configuration",
      gmtCreate: "Created at", gmtModified: "Modified at",
    },
    "zh-CN": {
      title: "PowerJob 只读查看", app: "应用", previousApp: "上一页应用", nextApp: "下一页应用",
      readonly: "只读", refresh: "刷新", jobList: "任务列表", resizeJobsPane: "调整任务栏宽度", jobs: "任务", jobKeyword: "任务关键字",
      searchJobs: "搜索任务", search: "查询", previous: "上一页", next: "下一页", jobWorkspace: "任务工作区",
      selectJob: "选择左侧任务", jobInfo: "任务信息", jobDetail: "任务详情", runsAndLogs: "实例与日志",
      selectJobDetail: "选择左侧任务查看详情", selectJobInstances: "选择左侧任务查看实例",
      jobInstances: "任务实例", instanceId: "实例 ID",
      instanceType: "实例类型", normalJob: "普通任务", workflow: "工作流", status: "状态",
      triggeredAt: "触发时间", finishedAt: "结束时间", instanceLogs: "实例日志", retry: "重试",
      selectInstanceLog: "选择上方实例查看日志", loadMore: "加载更多", instanceDetail: "实例详情",
      close: "关闭", loading: "加载中…", loadingJobs: "正在加载任务…", loadingDetail: "正在加载任务详情…",
      loadingInstances: "正在加载实例…", loadingLogs: "正在加载日志…", noSchedule: "无定时信息",
      enabled: "启用", disabled: "停用", yes: "是", no: "否", total: "共 {count} 条",
      noJobs: "没有符合条件的任务", noInstances: "没有符合条件的实例", noApps: "没有可访问的应用",
      noAccessibleJobs: "没有可访问的任务", unavailable: "连接不可用", selectConnection: "请先选择连接",
      openFromConnection: "请先从 DBX 连接打开工作台。", jobsFailed: "任务加载失败",
      appsFailed: "应用列表加载失败", detailFailed: "任务详情加载失败",
      instancesFailed: "实例加载失败", logFailed: "日志加载失败",
      instanceDetailFailed: "实例详情加载失败", hostFailed: "DBX 插件主机初始化失败",
      viewRuns: "切换到「实例与日志」查看实例", noLogs: "本实例没有日志",
      logPage: "{current} / {total} 页", logComplete: "已加载完", detail: "详情",
      instanceTitle: "实例 {id}", instanceWaitingDispatch: "等待派发",
      instanceWaitingWorker: "等待 Worker 接收", instanceRunning: "运行中", instanceFailed: "失败",
      instanceSucceeded: "成功", instanceCanceled: "取消", instanceStopped: "手动停止",
      workflowWaiting: "等待调度", jobId: "任务 ID", jobName: "任务名称", description: "描述",
      appId: "应用 ID", timeExpressionType: "定时类型", timeExpression: "定时表达式",
      executeType: "执行类型", processorType: "处理器类型", processorInfo: "处理器",
      jobParams: "任务参数", nextTriggerTimeStr: "下次触发", maxInstanceNum: "最大实例数",
      concurrency: "并发数", instanceTimeLimit: "实例超时", instanceRetryNum: "实例重试",
      taskRetryNum: "任务重试", dispatchStrategy: "分发策略", designatedWorkers: "指定 Worker",
      maxWorkerCount: "最大 Worker 数", lifeCycle: "生命周期", alarmConfig: "告警配置",
      logConfig: "日志配置", advancedRuntimeConfig: "高级运行配置",
      gmtCreate: "创建时间", gmtModified: "修改时间",
    },
  };

  let locale = "en";
  const normalize = (value) => /^zh(?:-|$)/i.test(value || "") ? "zh-CN" : "en";
  const t = (key, vars = {}) => {
    const template = dictionaries[locale][key] ?? dictionaries.en[key] ?? key;
    return template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ""));
  };
  function setLocale(value) {
    const next = normalize(value);
    if (next === locale) return false;
    locale = next;
    return true;
  }
  function applyStatic() {
    document.documentElement.lang = locale;
    document.title = t("title");
    for (const node of document.querySelectorAll("[data-i18n]")) node.textContent = t(node.dataset.i18n);
    for (const node of document.querySelectorAll("[data-i18n-placeholder]")) node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
    for (const node of document.querySelectorAll("[data-i18n-aria-label]")) node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
  }
  window.powerjobI18n = { t, setLocale, applyStatic, getLocale: () => locale, dictionaries };
})();
