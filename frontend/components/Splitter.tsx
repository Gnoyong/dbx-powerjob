import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import type { T } from "../uiTypes";

export function Splitter({ t }: { t: T }) {
  const workspace = useRef<HTMLElement | null>(null);
  const pane = useRef<HTMLElement | null>(null);
  const preferred = useRef(0);
  const drag = useRef<{ id: number; x: number; width: number } | null>(null);
  const [width, setWidth] = useState(0);
  const [maxWidth, setMaxWidth] = useState(240);
  const [resizing, setResizing] = useState(false);
  const storageKey = "local.powerjob.readonly.jobs-pane-width";
  const min = 240;

  const apply = useCallback((requested: number, remember = false) => {
    const root = workspace.current;
    if (!root) return;
    const max = Math.max(
      min,
      Math.floor(root.getBoundingClientRect().width) - 8 - 220,
    );
    const next = Math.max(min, Math.min(max, Math.round(requested)));
    setMaxWidth(max);
    setWidth(next);
    if (remember) preferred.current = next;
  }, []);

  useEffect(() => {
    workspace.current = document.querySelector(".workspace");
    pane.current = document.querySelector(".jobs-pane");
    let saved = NaN;
    try {
      saved = Number(localStorage.getItem(storageKey));
    } catch {
      /* sandboxed host */
    }
    preferred.current =
      Number.isFinite(saved) && saved >= min
        ? saved
        : (pane.current?.getBoundingClientRect().width ?? 320);
    apply(preferred.current);
    const resize = () => apply(preferred.current);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [apply]);

  function save() {
    try {
      localStorage.setItem(storageKey, String(preferred.current));
    } catch {
      /* sandboxed host */
    }
  }
  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || drag.current) return;
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      width: pane.current?.getBoundingClientRect().width ?? width,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizing(true);
    event.preventDefault();
  }
  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerId === drag.current?.id)
      apply(drag.current.width + event.clientX - drag.current.x, true);
  }
  function pointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerId !== drag.current?.id) return;
    drag.current = null;
    setResizing(false);
    save();
  }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 40 : 16;
    const current = pane.current?.getBoundingClientRect().width ?? width;
    const next =
      event.key === "ArrowLeft"
        ? current - step
        : event.key === "ArrowRight"
          ? current + step
          : event.key === "Home"
            ? min
            : event.key === "End"
              ? maxWidth
              : null;
    if (next === null) return;
    event.preventDefault();
    apply(next, true);
    save();
  }
  useEffect(() => {
    workspace.current?.classList.toggle("resizing", resizing);
    return () => workspace.current?.classList.remove("resizing");
  }, [resizing]);
  useEffect(() => {
    workspace.current?.style.setProperty("--jobs-pane-width", `${width}px`);
  }, [width]);
  return (
    <div
      className="pane-splitter"
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-controls="jobs-pane detail-pane"
      aria-label={t("resizeJobsPane")}
      aria-valuemin={min}
      aria-valuemax={maxWidth}
      aria-valuenow={width || min}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerEnd}
      onPointerCancel={pointerEnd}
      onLostPointerCapture={pointerEnd}
      onKeyDown={keyDown}
    />
  );
}
