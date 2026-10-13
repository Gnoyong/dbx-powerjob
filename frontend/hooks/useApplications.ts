import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { invoke, readSavedApplication, writeSavedApplication } from "../host";
import type { SavedApplication } from "../host";
import type { AppInfo, Page } from "../types";
import type { TranslationKey } from "../i18n";
import type { T } from "../uiTypes";

export function useApplications(connectionId: string | null, t: T) {
  const [appsIndex, setAppsIndex] = useState(0);
  const [restoredConnectionId, setRestoredConnectionId] = useState<string | null>(null);
  const pendingSavedApplication = useRef<SavedApplication | null>(null);
  const applicationWrites = useRef(Promise.resolve());
  const [apps, setApps] = useState<Page<AppInfo> | null>(null);
  const [appsStatus, setAppsStatus] = useState<TranslationKey>("loading");
  const [appId, setAppId] = useState("");
  const [appsRefresh, setAppsRefresh] = useState(0);
  const appPageEdge = useRef<"first" | "last" | null>(null);
  const latestT = useRef(t);
  latestT.current = t;
  useEffect(() => {
    let active = true;
    appPageEdge.current = null;
    pendingSavedApplication.current = null;
    setRestoredConnectionId(null);
    setAppsIndex(0);
    setApps(null);
    setAppId("");
    if (connectionId) {
      void readSavedApplication(connectionId)
        .then((saved) => {
          if (!active) return;
          pendingSavedApplication.current = saved;
          setAppsIndex(saved?.pageIndex ?? 0);
          setRestoredConnectionId(connectionId);
        })
        .catch(() => {
          if (!active) return;
          toast.error(latestT.current("applicationStorageFailed"), { id: "application-storage" });
          setRestoredConnectionId(connectionId);
        });
    }
    return () => { active = false; };
  }, [connectionId]);
  useEffect(() => {
    if (!connectionId) {
      setAppsStatus(connectionId === null ? "loading" : "selectConnection");
      return;
    }
    if (restoredConnectionId !== connectionId) return;
    let active = true;
    setAppsStatus("loading");
    void invoke(connectionId, "powerjob/apps", {
      index: appsIndex,
      pageSize: 100,
    })
      .then((page) => {
        if (!active) return;
        if (!page.data.length && appsIndex > 0) {
          pendingSavedApplication.current = null;
          setAppsIndex(0);
          return;
        }
        const edge = appPageEdge.current;
        appPageEdge.current = null;
        const saved = pendingSavedApplication.current;
        pendingSavedApplication.current = null;
        setApps(page);
        setAppsStatus(page.data.length ? "loading" : "noApps");
        setAppId((previous) => {
          const savedIsAvailable =
            !edge && saved?.pageIndex === page.index &&
            page.data.some((item) => String(item.id) === saved.appId);
          const previousIsAvailable =
            !edge && page.data.some((item) => String(item.id) === previous);
          const next = savedIsAvailable
            ? saved.appId
            : previousIsAvailable
              ? previous
              : String(
                page.data[edge === "last" ? page.data.length - 1 : 0]?.id ?? "",
              );
          return next;
        });
      })
      .catch(() => {
        if (!active) return;
        appPageEdge.current = null;
        setApps(null);
        setAppId("");
        setAppsStatus("unavailable");
      });
    return () => {
      active = false;
    };
  }, [connectionId, restoredConnectionId, appsIndex, appsRefresh]);
  useEffect(() => {
    if (!connectionId || restoredConnectionId !== connectionId || !appId ||
      !apps || apps.index !== appsIndex ||
      !apps.data.some((item) => String(item.id) === appId)) return;
    let active = true;
    const selection = { appId, pageIndex: apps.index };
    applicationWrites.current = applicationWrites.current
      .catch(() => { })
      .then(() => writeSavedApplication(connectionId, selection))
      .then(() => { if (active) toast.dismiss("application-storage"); })
      .catch(() => { if (active) toast.error(latestT.current("applicationStorageFailed"), { id: "application-storage" }); });
    return () => { active = false; };
  }, [connectionId, restoredConnectionId, appId, apps, appsIndex]);
  const ready = restoredConnectionId === connectionId;
  const appsLoading = !ready || !apps || apps.index !== appsIndex;
  function chooseApp(next: string) {
    if (!appsLoading && apps?.data.some(item => String(item.id) === next)) setAppId(next);
  }
  function stepApp(direction: -1 | 1) {
    if (!apps || appsLoading) return;
    const currentIndex = apps.data.findIndex(
      (item) => String(item.id) === appId,
    );
    if (currentIndex < 0) return;
    const nextIndex = currentIndex + direction;
    if (nextIndex >= 0 && nextIndex < apps.data.length) {
      const nextApp = apps.data[nextIndex];
      if (nextApp) chooseApp(String(nextApp.id));
    } else if (direction < 0 && apps.index > 0) {
      appPageEdge.current = "last";
      setAppsIndex(apps.index - 1);
    } else if (direction > 0 && apps.index + 1 < apps.totalPages) {
      appPageEdge.current = "first";
      setAppsIndex(apps.index + 1);
    }
  }
  function refreshApps() { setApps(null); setAppsRefresh(value => value + 1); }
  return {
    apps: ready ? apps : null, appId: ready ? appId : "", appsStatus,
    appsLoading, chooseApp, stepApp, refreshApps,
    selectedApp: ready ? apps?.data.find(item => String(item.id) === appId) : undefined
  };
}
