import { useCallback, useRef, useState } from "react";
import { Button } from "./components/ui/button";
import { Toolbar } from "./components/Toolbar";
import { label } from "./format";
import { useHostEnvironment } from "./hooks/useHostEnvironment";
import { useApplications } from "./hooks/useApplications";
import { TaskWorkspace } from "./tasks/TaskWorkspace";
import type { TaskWorkspaceHandle } from "./tasks/TaskWorkspace";
import WorkflowWorkspace from "./workflow/WorkflowWorkspace";

export default function App() {
  const { connectionId, locale, hostFailed, t } = useHostEnvironment();
  const {
    appId,
    apps,
    appsLoading,
    appsStatus,
    selectedApp,
    chooseApp,
    stepApp,
    refreshApps,
  } = useApplications(connectionId, t);
  const [workspaceMode, setWorkspaceMode] = useState<"tasks" | "workflows">(
    "tasks",
  );
  const [actionBusy, setActionBusy] = useState(false);
  const [jobsFailed, setJobsFailed] = useState(false);
  const tasks = useRef<TaskWorkspaceHandle>(null);
  const workflowNavigation = useRef<((action: () => void) => void) | null>(
    null,
  );
  const registerWorkflowNavigation = useCallback(
    (guard: ((action: () => void) => void) | null) => {
      workflowNavigation.current = guard;
    },
    [],
  );
  function navigateWorkspace(action: () => void) {
    if (workspaceMode === "workflows" && workflowNavigation.current)
      workflowNavigation.current(action);
    else action();
  }
  function refreshCurrent() {
    if (appId) tasks.current?.refresh();
    else if (connectionId) refreshApps();
  }
  const message = hostFailed
    ? "hostFailed"
    : connectionId === ""
      ? "openFromConnection"
      : appsStatus === "unavailable"
        ? "appsFailed"
        : jobsFailed
          ? "jobsFailed"
          : null;
  return (
    <div className="shell">
      <Toolbar
        appId={appId}
        apps={apps}
        appsLoading={appsLoading}
        appsStatus={appsStatus}
        onChooseApp={(id) => navigateWorkspace(() => chooseApp(id))}
        onPreviousApp={() => navigateWorkspace(() => stepApp(-1))}
        onNextApp={() => navigateWorkspace(() => stepApp(1))}
        onCreateJob={() => tasks.current?.create()}
        createDisabled={!connectionId || !appId || actionBusy}
        onRefresh={refreshCurrent}
        t={t}
        showJobControls={workspaceMode === "tasks"}
      >
        <Button
          type="button"
          size="xs"
          variant={workspaceMode === "tasks" ? "default" : "secondary"}
          disabled={actionBusy}
          onClick={() => navigateWorkspace(() => setWorkspaceMode("tasks"))}
        >
          {t("jobs")}
        </Button>
        <Button
          type="button"
          size="xs"
          variant={workspaceMode === "workflows" ? "default" : "secondary"}
          disabled={actionBusy}
          onClick={() => setWorkspaceMode("workflows")}
        >
          {t("workflow")}
        </Button>
      </Toolbar>
      <span
        className="sr-only"
        aria-live="polite"
      >
        {selectedApp
          ? label(selectedApp.title || selectedApp.appName)
          : t(appsStatus)}
      </span>
      {message && (
        <div
          role="status"
          className="message"
        >
          {t(message)}
        </div>
      )}
      <main className="workspace">
        <TaskWorkspace
          ref={tasks}
          connectionId={connectionId}
          appId={appId}
          locale={locale}
          t={t}
          visible={workspaceMode === "tasks"}
          onBusyChange={setActionBusy}
          onJobsFailed={setJobsFailed}
        />
        {workspaceMode === "workflows" &&
          (connectionId && appId ? (
            <WorkflowWorkspace
              key={JSON.stringify([connectionId, appId])}
              connectionId={connectionId}
              appId={appId}
              locale={locale}
              t={t}
              registerNavigation={registerWorkflowNavigation}
            />
          ) : (
            <p>{t("selectConnection")}</p>
          ))}
      </main>
    </div>
  );
}
