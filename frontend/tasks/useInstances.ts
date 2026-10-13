import { useCallback, useEffect, useState } from "react";
import { invoke } from "../host";
import type { Instance, InstanceType, Page } from "../types";
import type { TranslationKey } from "../i18n";
type Filter = { type: InstanceType; instanceId: string; status: string };
const instancePollIntervalMs = 3000;

export function useInstances(connectionId: string | null, appId: string, selectedJobId: string, visible: boolean) {
  const [instanceIndex, setInstanceIndex] = useState(0);
  const [draftInstanceId, setDraftInstanceId] = useState("");
  const [draftType, setDraftType] = useState<InstanceType>("NORMAL");
  const [draftStatus, setDraftStatus] = useState("");
  const [filter, setFilter] = useState<Filter>({
    type: "NORMAL",
    instanceId: "",
    status: "",
  });
  const [instances, setInstances] = useState<Page<Instance> | null>(null);
  const [instancesStatus, setInstancesStatus] =
    useState<TranslationKey>("selectJobInstances");
  const [selectedInstanceId, setSelectedInstanceId] = useState("");
  const [instancesRefresh, setInstancesRefresh] = useState(0);
  const scope = JSON.stringify([connectionId, appId, selectedJobId]);
  const [owner, setOwner] = useState(scope);
  useEffect(() => {
    setOwner(scope);
    setInstanceIndex(0);
    setInstances(null);
    setSelectedInstanceId("");
    setInstancesStatus(selectedJobId ? "viewRuns" : "selectJobInstances");
  }, [scope, selectedJobId]);
  useEffect(() => {
    if (
      !visible || owner !== scope ||
      !connectionId ||
      !appId ||
      !selectedJobId
    )
      return;
    const activeConnectionId = connectionId;
    let active = true;
    let inFlight = false;
    async function load(isInitial: boolean) {
      if (inFlight) return;
      inFlight = true;
      if (isInitial) setInstancesStatus("loadingInstances");
      try {
        const page = await invoke(activeConnectionId, "powerjob/instances", {
          appId,
          jobId: selectedJobId,
          index: instanceIndex,
          pageSize: 20,
          type: filter.type,
          instanceId: filter.instanceId,
          status: filter.status,
        });
        if (!active) return;
        setInstances(page);
        setInstancesStatus(page.data.length ? "loading" : "noInstances");
        setSelectedInstanceId((previous) =>
          page.data.some((item) => String(item.instanceId) === previous)
            ? previous
            : String(page.data[0]?.instanceId ?? ""),
        );
      } catch {
        if (!active) return;
        if (isInitial) {
          setInstances(null);
          setSelectedInstanceId("");
          setInstancesStatus("instancesFailed");
        }
      } finally {
        inFlight = false;
      }
    }
    void load(true);
    const timer = window.setInterval(() => {
      void load(false);
    }, instancePollIntervalMs);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [
    connectionId,
    appId,
    selectedJobId,
    visible,
    owner,
    scope,
    instanceIndex,
    filter.type,
    filter.instanceId,
    filter.status,
    instancesRefresh,
  ]);
  const refreshInstances = useCallback(() => setInstancesRefresh(value => value + 1), []);
  function searchInstances() {
    setInstanceIndex(0);
    refreshInstances();
    setFilter({
      type: draftType,
      instanceId: draftInstanceId.trim(),
      status: draftStatus,
    });
  }
  function showNormalRuns() {
    setInstanceIndex(0);
    setDraftInstanceId("");
    setDraftType("NORMAL");
    setDraftStatus("");
    setFilter({ type: "NORMAL", instanceId: "", status: "" });
    setSelectedInstanceId("");
    refreshInstances();
  }
  function chooseInstance(instance: Instance) { setSelectedInstanceId(String(instance.instanceId)); }
  function changeDraftType(type: InstanceType) { setDraftType(type); setDraftStatus(""); }
  return {
    instances: owner === scope ? instances : null, instancesStatus,
    instancesLoading: owner !== scope || instancesStatus === "loadingInstances",
    draftInstanceId, setDraftInstanceId, draftType, changeDraftType, draftStatus, setDraftStatus,
    filterType: filter.type, selectedInstanceId: owner === scope ? selectedInstanceId : "",
    chooseInstance, searchInstances, pageInstances: setInstanceIndex, refreshInstances, instancesRefresh, showNormalRuns
  };
}
