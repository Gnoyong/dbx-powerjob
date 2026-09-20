(() => {
  "use strict";

  const host = window.dbxPlugin;
  const i18n = window.powerjobI18n;
  const t = i18n.t;
  const $ = (id) => document.getElementById(id);
  const state = {
    connectionId: "", appId: "", appsIndex: 0, apps: null,
    jobsIndex: 0, jobs: null, selectedJob: null, jobDetail: null, detailTab: "detail",
    instancesIndex: 0, instances: null, selectedInstance: null,
    logNextIndex: 0, logTotalPages: null, logLoading: false, logAutoFill: 0,
    appStatus: "loading", appNameStatus: "loading", jobsStatus: "selectConnection",
    detailStatus: "selectJobDetail", instanceStatus: "selectJobDetail",
    logContentStatus: "selectInstanceLog", logStateStatus: "", messageKey: "",
    modalStatus: "", modalInstanceId: "",
    appSeq: 0, jobsSeq: 0, detailSeq: 0, instanceSeq: 0, logSeq: 0, modalSeq: 0,
  };

  const jobFields = [
    ["id", "jobId"], ["jobName", "jobName"], ["jobDescription", "description"],
    ["enable", "enabled"], ["appId", "appId"], ["timeExpressionType", "timeExpressionType"],
    ["timeExpression", "timeExpression"], ["executeType", "executeType"],
    ["processorType", "processorType"], ["processorInfo", "processorInfo"],
    ["jobParams", "jobParams"], ["nextTriggerTimeStr", "nextTriggerTimeStr"],
    ["maxInstanceNum", "maxInstanceNum"], ["concurrency", "concurrency"],
    ["instanceTimeLimit", "instanceTimeLimit"], ["instanceRetryNum", "instanceRetryNum"],
    ["taskRetryNum", "taskRetryNum"], ["dispatchStrategy", "dispatchStrategy"],
    ["designatedWorkers", "designatedWorkers"], ["maxWorkerCount", "maxWorkerCount"],
    ["lifeCycle", "lifeCycle"], ["alarmConfig", "alarmConfig"],
    ["logConfig", "logConfig"], ["advancedRuntimeConfig", "advancedRuntimeConfig"],
    ["gmtCreate", "gmtCreate"], ["gmtModified", "gmtModified"],
  ];

  function label(value) {
    return value === null || value === undefined || value === "" ? "—" : String(value);
  }

  function dateLabel(value) {
    if (!value) return "—";
    const number = Number(value);
    if (!Number.isFinite(number)) return label(value);
    const date = new Date(number);
    return Number.isNaN(date.getTime()) ? label(value) : date.toLocaleString(i18n.getLocale());
  }

  function message(key) {
    state.messageKey = key;
    $("message").textContent = key ? t(key) : "";
    $("message").hidden = !key;
  }

  function pageControls(prefix, page) {
    const index = page?.index || 0;
    const pages = page?.totalPages || 0;
    $(prefix + "-prev").disabled = !page || index <= 0;
    $(prefix + "-next").disabled = !page || index + 1 >= pages;
    $(prefix + "-page").textContent = pages ? `${index + 1} / ${pages}` : "0 / 0";
    const count = $(prefix + "-count");
    if (count) count.textContent = page ? t("total", { count: page.totalItems || 0 }) : "";
  }

  function appPlaceholder(key) {
    state.appStatus = key;
    const select = $("app-select");
    select.replaceChildren(new Option(t(key), ""));
    select.disabled = true;
    pageControls("apps", null);
  }

  function emptyJobs(key) {
    state.jobsStatus = key;
    const row = document.createElement("div");
    row.className = "empty-pane";
    row.textContent = t(key);
    $("jobs-list").replaceChildren(row);
  }

  function emptyInstances(key) {
    state.instanceStatus = key;
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "instance-empty";
    td.textContent = t(key);
    tr.appendChild(td);
    $("instances-body").replaceChildren(tr);
  }

  async function invoke(method, params = {}) {
    if (!state.connectionId) throw new Error(t("openFromConnection"));
    return host.invoke(method, { connectionId: state.connectionId, ...params }, { timeoutMs: 30000 });
  }

  function resetLog() {
    state.logSeq++;
    state.logNextIndex = 0;
    state.logTotalPages = null;
    state.logLoading = false;
    state.logAutoFill = 0;
    $("log-instance-label").textContent = state.selectedInstance ? `#${state.selectedInstance.instanceId}` : "";
    state.logStateStatus = "";
    $("log-state").textContent = "";
    $("log-retry").hidden = true;
    $("log-more").hidden = true;
    state.logContentStatus = state.selectedInstance ? "loadingLogs" : "selectInstanceLog";
    $("log-content").textContent = t(state.logContentStatus);
    $("log-scroll").scrollTop = 0;
  }

  function resetSelection() {
    state.detailSeq++;
    state.instanceSeq++;
    state.modalSeq++;
    if ($("instance-detail-dialog").open) $("instance-detail-dialog").close();
    state.selectedJob = null;
    state.jobDetail = null;
    state.instances = null;
    state.selectedInstance = null;
    $("selected-job-title").textContent = t("selectJob");
    $("job-detail-content").className = "detail-scroll empty-pane";
    state.detailStatus = "selectJobDetail";
    $("job-detail-content").textContent = t(state.detailStatus);
    emptyInstances("selectJobDetail");
    pageControls("instances", null);
    resetLog();
  }

  function renderJobs() {
    state.jobsStatus = "";
    const list = $("jobs-list");
    list.replaceChildren();
    if (!state.jobs?.data?.length) {
      emptyJobs("noJobs");
      return;
    }
    for (const job of state.jobs.data) {
      const wrap = document.createElement("div");
      wrap.className = "job-item-wrap";
      wrap.setAttribute("role", "listitem");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "job-item";
      button.setAttribute("aria-pressed", String(String(job.id) === String(state.selectedJob?.id)));
      button.title = `${label(job.jobName)} · ${label(job.id)}`;
      const main = document.createElement("span");
      main.className = "job-main";
      const name = document.createElement("span");
      name.className = "job-name";
      name.textContent = label(job.jobName);
      const id = document.createElement("span");
      id.className = "job-id";
      id.textContent = `#${job.id}`;
      main.append(name, id);
      const meta = document.createElement("span");
      meta.className = "job-meta";
      const schedule = document.createElement("span");
      schedule.textContent = [job.timeExpressionType, job.timeExpression].filter(Boolean).join(" · ") || t("noSchedule");
      const enabled = document.createElement("span");
      enabled.textContent = job.enable ? t("enabled") : t("disabled");
      meta.append(schedule, enabled);
      button.append(main, meta);
      button.addEventListener("click", () => selectJob(job));
      wrap.appendChild(button);
      list.appendChild(wrap);
    }
  }

  function renderJobDetail(detail) {
    state.jobDetail = detail;
    state.detailStatus = "";
    const content = $("job-detail-content");
    content.className = "detail-scroll";
    const table = document.createElement("table");
    table.className = "inspector-table";
    const body = document.createElement("tbody");
    for (const [key, titleKey] of jobFields) {
      if (!(key in detail)) continue;
      const tr = document.createElement("tr");
      const th = document.createElement("th");
      th.scope = "row";
      th.textContent = t(titleKey);
      const td = document.createElement("td");
      const value = detail[key];
      if ((typeof value === "object" && value !== null) || (typeof value === "string" && (value.length > 80 || value.includes("\n")))) {
        const pre = document.createElement("pre");
        pre.textContent = typeof value === "object" ? JSON.stringify(value, null, 2) : value;
        td.appendChild(pre);
      } else if (typeof value === "boolean") {
        td.textContent = value ? t("yes") : t("no");
      } else {
        td.textContent = label(value);
      }
      tr.append(th, td);
      body.appendChild(tr);
    }
    table.appendChild(body);
    content.replaceChildren(table);
  }

  async function loadJobDetail() {
    if (!state.selectedJob) return;
    const serial = ++state.detailSeq;
    const appId = state.appId;
    const jobId = String(state.selectedJob.id);
    state.jobDetail = null;
    state.detailStatus = "loadingDetail";
    $("job-detail-content").className = "detail-scroll empty-pane";
    $("job-detail-content").textContent = t(state.detailStatus);
    try {
      const detail = await invoke("powerjob/job", { appId, jobId });
      if (serial !== state.detailSeq || appId !== state.appId || jobId !== String(state.selectedJob?.id)) return;
      renderJobDetail(detail);
    } catch (error) {
      if (serial !== state.detailSeq) return;
      state.detailStatus = "detailFailed";
      $("job-detail-content").textContent = t(state.detailStatus);
    }
  }

  function selectJob(job) {
    if (String(job.id) === String(state.selectedJob?.id)) return;
    state.selectedJob = job;
    state.jobDetail = null;
    state.instancesIndex = 0;
    state.instances = null;
    state.instanceSeq++;
    state.selectedInstance = null;
    $("selected-job-title").textContent = `${label(job.jobName)}  ·  #${job.id}`;
    emptyInstances("viewRuns");
    pageControls("instances", null);
    resetLog();
    renderJobs();
    loadJobDetail();
    if (state.detailTab === "runs") loadInstances();
  }

  async function loadJobs() {
    if (!state.appId) return;
    const serial = ++state.jobsSeq;
    const appId = state.appId;
    emptyJobs("loadingJobs");
    message("");
    try {
      const result = await invoke("powerjob/jobs", {
        appId, index: state.jobsIndex, pageSize: 20, keyword: $("job-keyword").value.trim(),
      });
      if (serial !== state.jobsSeq || appId !== state.appId) return;
      state.jobs = result;
      pageControls("jobs", result);
      const selected = result.data?.find((job) => String(job.id) === String(state.selectedJob?.id)) || result.data?.[0];
      if (selected) {
        // Re-select after refresh so the inspector reflects the latest server response.
        state.selectedJob = null;
        selectJob(selected);
      } else {
        resetSelection();
        renderJobs();
      }
    } catch (error) {
      if (serial !== state.jobsSeq) return;
      state.jobs = null;
      resetSelection();
      emptyJobs("jobsFailed");
      pageControls("jobs", null);
      message("jobsFailed");
    }
  }

  async function loadApps() {
    const serial = ++state.appSeq;
    message("");
    state.appNameStatus = "loading";
    $("app-name").textContent = t(state.appNameStatus);
    appPlaceholder("loading");
    try {
      const result = await invoke("powerjob/apps", { index: state.appsIndex, pageSize: 100 });
      if (serial !== state.appSeq) return;
      state.apps = result;
      state.appStatus = "";
      const select = $("app-select");
      select.replaceChildren();
      for (const app of result.data || []) {
        const option = document.createElement("option");
        option.value = String(app.id);
        option.textContent = label(app.title || app.appName || app.id);
        select.appendChild(option);
      }
      if (!result.data?.length) appPlaceholder("noApps");
      else select.disabled = false;
      if (!(result.data || []).some((app) => String(app.id) === state.appId)) {
        state.appId = String(result.data?.[0]?.id || "");
        resetSelection();
      }
      select.value = state.appId;
      const selected = result.data?.find((app) => String(app.id) === state.appId);
      state.appNameStatus = selected ? "" : "noApps";
      $("app-name").textContent = selected ? label(selected.title || selected.appName) : t(state.appNameStatus);
      pageControls("apps", result);
      if (state.appId) loadJobs();
      else { emptyJobs("noAccessibleJobs"); pageControls("jobs", null); }
    } catch (error) {
      if (serial !== state.appSeq) return;
      state.appId = "";
      state.apps = null;
      resetSelection();
      appPlaceholder("unavailable");
      state.appNameStatus = "unavailable";
      $("app-name").textContent = t(state.appNameStatus);
      emptyJobs("noAccessibleJobs");
      message("appsFailed");
    }
  }

  function setDetailTab(tab) {
    state.detailTab = tab;
    $("tab-detail").classList.toggle("active", tab === "detail");
    $("tab-runs").classList.toggle("active", tab === "runs");
    $("tab-detail").setAttribute("aria-current", tab === "detail" ? "page" : "false");
    $("tab-runs").setAttribute("aria-current", tab === "runs" ? "page" : "false");
    $("job-detail-view").hidden = tab !== "detail";
    $("job-runs-view").hidden = tab !== "runs";
    if (tab === "runs" && state.selectedJob && !state.instances) loadInstances();
  }

  function renderInstances() {
    state.instanceStatus = "";
    const body = $("instances-body");
    body.replaceChildren();
    if (!state.instances?.data?.length) {
      emptyInstances("noInstances");
      return;
    }
    for (const instance of state.instances.data) {
      const tr = document.createElement("tr");
      tr.tabIndex = 0;
      tr.dataset.instanceId = String(instance.instanceId);
      tr.classList.toggle("selected", tr.dataset.instanceId === String(state.selectedInstance?.instanceId));
      tr.setAttribute("aria-selected", String(tr.classList.contains("selected")));
      for (const value of [instance.instanceId, instance.status, dateLabel(instance.actualTriggerTime), dateLabel(instance.finishedTime)]) {
        const td = document.createElement("td");
        td.textContent = label(value);
        tr.appendChild(td);
      }
      const action = document.createElement("td");
      const detail = document.createElement("button");
      detail.type = "button";
      detail.className = "ghost";
      detail.textContent = t("detail");
      detail.addEventListener("click", (event) => { event.stopPropagation(); showInstanceDetail(instance); });
      action.appendChild(detail);
      tr.appendChild(action);
      tr.addEventListener("click", () => selectInstance(instance));
      tr.addEventListener("keydown", (event) => {
        if (event.target === tr && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          selectInstance(instance);
        }
      });
      body.appendChild(tr);
    }
  }

  async function loadInstances() {
    if (!state.selectedJob) return;
    const serial = ++state.instanceSeq;
    const appId = state.appId;
    const jobId = String(state.selectedJob.id);
    emptyInstances("loadingInstances");
    try {
      const result = await invoke("powerjob/instances", {
        appId, jobId, index: state.instancesIndex, pageSize: 20,
        type: $("instance-type").value, instanceId: $("instance-id").value.trim(),
      });
      if (serial !== state.instanceSeq || appId !== state.appId || jobId !== String(state.selectedJob?.id)) return;
      state.instances = result;
      pageControls("instances", result);
      const selected = result.data?.find((item) => String(item.instanceId) === String(state.selectedInstance?.instanceId)) || result.data?.[0];
      if (selected) {
        if (String(selected.instanceId) !== String(state.selectedInstance?.instanceId)) selectInstance(selected);
        else renderInstances();
      } else {
        state.selectedInstance = null;
        resetLog();
        renderInstances();
      }
    } catch (error) {
      if (serial !== state.instanceSeq) return;
      state.instances = null;
      state.selectedInstance = null;
      resetLog();
      emptyInstances("instancesFailed");
      pageControls("instances", null);
    }
  }

  function selectInstance(instance) {
    if (String(instance.instanceId) === String(state.selectedInstance?.instanceId)) return;
    state.selectedInstance = instance;
    renderInstances();
    resetLog();
    loadNextLog();
  }

  function nearLogBottom() {
    const panel = $("log-scroll");
    return panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 80;
  }

  async function loadNextLog() {
    if (!state.selectedInstance || state.logLoading) return;
    if (state.logTotalPages !== null && state.logNextIndex >= state.logTotalPages) return;
    const serial = state.logSeq;
    const appId = state.appId;
    const instanceId = String(state.selectedInstance.instanceId);
    const index = state.logNextIndex;
    state.logLoading = true;
    $("log-retry").hidden = true;
    $("log-more").hidden = true;
    $("log-state").textContent = "加载中…";
    try {
      const result = await invoke("powerjob/log", { appId, instanceId, index });
      if (serial !== state.logSeq || instanceId !== String(state.selectedInstance?.instanceId) || appId !== state.appId) return;
      const content = $("log-content");
      if (index === 0) content.replaceChildren();
      if (result.data) content.appendChild(document.createTextNode(result.data));
      state.logNextIndex = result.index + 1;
      state.logTotalPages = result.totalPages;
      state.logLoading = false;
      const more = state.logNextIndex < state.logTotalPages;
      if (!content.textContent && !more) content.textContent = "本实例没有日志";
      $("log-state").textContent = more ? `${state.logNextIndex} / ${state.logTotalPages} 页` : "已加载完";
      requestAnimationFrame(() => {
        if (serial !== state.logSeq || !more) return;
        const panel = $("log-scroll");
        if (panel.scrollHeight <= panel.clientHeight + 8 && state.logAutoFill < 4) {
          state.logAutoFill++;
          loadNextLog();
        } else if (panel.scrollHeight <= panel.clientHeight + 8) {
          $("log-more").hidden = false;
        }
      });
    } catch (error) {
      if (serial !== state.logSeq) return;
      state.logLoading = false;
      $("log-state").textContent = error.message || "日志加载失败";
      $("log-retry").hidden = false;
      if (index === 0) $("log-content").textContent = "日志加载失败";
    }
  }

  async function showInstanceDetail(instance) {
    const serial = ++state.modalSeq;
    const dialog = $("instance-detail-dialog");
    $("instance-detail-title").textContent = `实例 ${instance.instanceId}`;
    $("instance-detail-content").textContent = "正在加载…";
    dialog.showModal();
    try {
      const result = await invoke("powerjob/instance", { appId: state.appId, instanceId: String(instance.instanceId) });
      if (dialog.open && serial === state.modalSeq) $("instance-detail-content").textContent = JSON.stringify(result, null, 2);
    } catch (error) {
      if (dialog.open && serial === state.modalSeq) $("instance-detail-content").textContent = error.message || "实例详情加载失败";
    }
  }

  function bind() {
    $("refresh").addEventListener("click", () => { if (state.appId) loadJobs(); else if (state.connectionId) loadApps(); });
    $("app-select").addEventListener("change", (event) => {
      state.appId = event.target.value;
      const app = state.apps?.data?.find((item) => String(item.id) === state.appId);
      $("app-name").textContent = label(app?.title || app?.appName);
      state.jobsIndex = 0;
      state.jobsSeq++;
      resetSelection();
      if (state.appId) loadJobs();
    });
    $("apps-prev").addEventListener("click", () => { if (state.appsIndex > 0) { state.appsIndex--; loadApps(); } });
    $("apps-next").addEventListener("click", () => { state.appsIndex++; loadApps(); });
    $("jobs-search").addEventListener("submit", (event) => { event.preventDefault(); state.jobsIndex = 0; loadJobs(); });
    $("jobs-prev").addEventListener("click", () => { if (state.jobsIndex > 0) { state.jobsIndex--; loadJobs(); } });
    $("jobs-next").addEventListener("click", () => { state.jobsIndex++; loadJobs(); });
    $("tab-detail").addEventListener("click", () => setDetailTab("detail"));
    $("tab-runs").addEventListener("click", () => setDetailTab("runs"));
    $("instances-search").addEventListener("submit", (event) => { event.preventDefault(); state.instancesIndex = 0; loadInstances(); });
    $("instances-prev").addEventListener("click", () => { if (state.instancesIndex > 0) { state.instancesIndex--; loadInstances(); } });
    $("instances-next").addEventListener("click", () => { state.instancesIndex++; loadInstances(); });
    $("log-scroll").addEventListener("scroll", () => {
      if (nearLogBottom()) { state.logAutoFill = 0; loadNextLog(); }
    });
    $("log-more").addEventListener("click", () => { state.logAutoFill = 0; loadNextLog(); });
    $("log-retry").addEventListener("click", loadNextLog);
    $("instance-detail-close").addEventListener("click", () => { state.modalSeq++; $("instance-detail-dialog").close(); });
  }

  function boot() {
    bind();
    host.ready.then(() => {
      let initialized = false;
      const updateContext = (context) => {
        const id = context?.connectionId || "";
        if (initialized && id === state.connectionId) return;
        initialized = true;
        state.connectionId = id;
        state.appId = "";
        state.appsIndex = 0;
        state.jobsIndex = 0;
        state.appSeq++;
        state.jobsSeq++;
        state.jobs = null;
        resetSelection();
        emptyJobs(id ? "正在加载任务…" : "请先选择连接");
        pageControls("jobs", null);
        if (id) loadApps();
        else {
          appPlaceholder("请先选择连接");
          $("app-name").textContent = "请先选择连接";
          message("请先从 DBX 连接打开工作台。");
        }
      };
      updateContext(host.context);
      host.onContext(updateContext);
    }).catch((error) => message(error.message || "DBX 插件主机初始化失败"));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
