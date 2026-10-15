import { useCallback, useEffect, useRef, useState } from "react";
import type { PanelImperativeHandle, PanelSize } from "react-resizable-panels";
import { readPanelSize, writePanelSize } from "../host";

export function useStoredPanelSize(key: string, minimum: number) {
  const [state, setState] = useState<{ ready: boolean; size: number | null }>({ ready: false, size: null });
  const [failed, setFailed] = useState(false);
  const currentSize = useRef(0);
  const changed = useRef(false);
  const mounted = useRef(false);
  const restoreVersion = useRef(0);
  const panelRef = useRef<PanelImperativeHandle | null>(null);

  const restore = useCallback(async (isActive: () => boolean) => {
    const version = ++restoreVersion.current;
    try {
      const size = await readPanelSize(key, minimum);
      if (isActive() && version === restoreVersion.current && !changed.current) {
        if (size !== null) panelRef.current?.resize(size);
        setState({ ready: true, size });
        setFailed(false);
      }
    } catch {
      if (isActive() && version === restoreVersion.current && !changed.current) {
        setState({ ready: true, size: null });
        setFailed(true);
      }
    }
  }, [key, minimum]);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    void restore(() => active);
    return () => { active = false; mounted.current = false; };
  }, [restore]);

  function persist() {
    const size = currentSize.current;
    if (!Number.isFinite(size) || size < minimum) return;
    void writePanelSize(key, size).then(
      () => { if (mounted.current) setFailed(false); },
      () => { if (mounted.current) setFailed(true); },
    );
  }

  return {
    ...state,
    failed,
    panelRef,
    onResize: (size: PanelSize) => { currentSize.current = size.inPixels; },
    onLayoutChanged: (_layout: unknown, meta: { isUserInteraction: boolean }) => {
      if (!meta.isUserInteraction) return;
      changed.current = true;
      persist();
    },
    retry: () => {
      if (changed.current) persist();
      else void restore(() => mounted.current);
    },
  };
}
