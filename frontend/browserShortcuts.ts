/** Cancel browser defaults after existing page shortcut handlers have run. */
export function preventBrowserShortcut(event: KeyboardEvent) {
  if (event.getModifierState("AltGraph")) return;
  if (event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && event.key.toLowerCase() === "f") return;
  if (!event.altKey && !event.shiftKey && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") return;

  const modifierOnly = ["Control", "Shift", "Alt", "Meta"].includes(event.key);
  if ((!modifierOnly && (event.ctrlKey || event.metaKey || event.altKey)) || /^F([1-9]|1[0-2])$/.test(event.key)) {
    event.preventDefault();
  }
}

export function installBrowserShortcutGuard(target: Window) {
  target.addEventListener("keydown", (event) => {
    const cancelDefault = (bubbledEvent: KeyboardEvent) => {
      if (bubbledEvent === event) preventBrowserShortcut(bubbledEvent);
    };
    // Register during capture so existing window and page handlers run first.
    target.addEventListener("keydown", cancelDefault);
    // Propagation may be stopped before the event reaches window again.
    setTimeout(() => target.removeEventListener("keydown", cancelDefault), 0);
  }, true);
}
