import { useEffect, useRef } from "react";
import { Button } from "../components/ui/button";
import type { Locale } from "../i18n";
import { workflowText } from "./i18n";
import type { WorkflowDefinition } from "./types";

export type WorkflowAction = "run" | "copy" | "enable" | "disable" | "delete";
export type WorkflowMenu = {
  workflow: WorkflowDefinition;
  x: number;
  y: number;
  trigger: HTMLButtonElement;
};

export function WorkflowContextMenu({
  menu,
  locale,
  disabled,
  onClose,
  onAction,
}: {
  menu: WorkflowMenu;
  locale: Locale;
  disabled: boolean;
  onClose: () => void;
  onAction: (action: WorkflowAction, workflow: WorkflowDefinition) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const w = workflowText(locale);
  useEffect(() => {
    ref.current
      ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus();
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        menu.trigger.focus();
      }
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [menu, onClose]);
  return (
    <div
      ref={ref}
      className="job-context-menu"
      role="menu"
      aria-label={menu.workflow.wfName}
      style={{
        left: Math.max(4, Math.min(menu.x, window.innerWidth - 180)),
        top: Math.max(4, Math.min(menu.y, window.innerHeight - 128)),
      }}
      onKeyDown={(event) => {
        if (!["ArrowDown", "ArrowUp", "Home", "End", "Tab"].includes(event.key))
          return;
        if (event.key === "Tab") {
          onClose();
          return;
        }
        event.preventDefault();
        const buttons = Array.from(
          ref.current?.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ) ?? [],
        );
        const index = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : (index +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  buttons.length) %
                buttons.length;
        buttons[next]?.focus();
      }}
    >
      {(
        [
          "run",
          "copy",
          menu.workflow.enable ? "disable" : "enable",
          "delete",
        ] as const
      ).map((action) => (
        <Button
          key={action}
          type="button"
          size="xs"
          variant="ghost"
          role="menuitem"
          disabled={disabled}
          className={
            action === "delete" ? "job-context-menu-delete" : undefined
          }
          onClick={() => {
            onClose();
            onAction(action, menu.workflow);
          }}
        >
          {w(action)}
        </Button>
      ))}
    </div>
  );
}
