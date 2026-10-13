import { useEffect, useState } from "react";
import { invoke } from "../host";
import type { JobDetail } from "../types";
import type { TranslationKey } from "../i18n";

export function useJobDetail(connectionId: string | null, appId: string, selectedJobId: string, refresh: number) {
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [detailStatus, setDetailStatus] =
    useState<TranslationKey>("selectJobDetail");
  const scope = JSON.stringify([connectionId, appId, selectedJobId]);
  const [owner, setOwner] = useState(scope);
  useEffect(() => {
    setOwner(scope);
    if (!connectionId || !appId || !selectedJobId) {
      setDetail(null);
      setDetailStatus("selectJobDetail");
      return;
    }
    let active = true;
    setDetail(null);
    setDetailStatus("loadingDetail");
    void invoke(connectionId, "powerjob/job", { appId, jobId: selectedJobId })
      .then((value) => {
        if (active) setDetail(value);
      })
      .catch(() => {
        if (active) setDetailStatus("detailFailed");
      });
    return () => {
      active = false;
    };
  }, [connectionId, appId, selectedJobId, refresh, scope]);
  return { detail: owner === scope ? detail : null, detailStatus };
}
