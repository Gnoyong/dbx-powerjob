import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { invoke, type NotificationUser } from "../host";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import type { Locale } from "../i18n";
import { workflowText } from "./i18n";

export function NotificationUserSelect({ connectionId, appId, locale, value, disabled, onChange }: {
  connectionId: string;
  appId: string;
  locale: Locale;
  value: string[];
  disabled: boolean;
  onChange: (ids: string[]) => void;
}) {
  const w = workflowText(locale);
  const labelId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [epoch, setEpoch] = useState(0);
  const scope = JSON.stringify([connectionId, appId]);
  const [result, setResult] = useState<{ scope: string; users: NotificationUser[]; error: string; loading: boolean }>({ scope, users: [], error: "", loading: true });
  useEffect(() => {
    let active = true;
    setOpen(false);
    setQuery("");
    setResult({ scope, users: [], error: "", loading: true });
    void invoke(connectionId, "powerjob/users", { appId }).then(
      (users) => { if (active) setResult({ scope, users, error: "", loading: false }); },
      (error: unknown) => { if (active) setResult({ scope, users: [], error: String(error), loading: false }); },
    );
    return () => { active = false; };
  }, [connectionId, appId, scope, epoch]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  const current = result.scope === scope;
  const users = current ? result.users : [];
  const loading = !current || result.loading;
  const error = current ? result.error : "";
  const names = new Map(users.map((user) => [user.id, user.showName || user.username || user.id]));
  const options: NotificationUser[] = [
    ...users,
    ...value.filter((id) => !names.has(id)).map((id) => ({ id })),
  ];
  const keyword = query.trim().toLocaleLowerCase();
  const filtered = options.filter((user) =>
    [user.id, user.username, user.showName].some((text) => text?.toLocaleLowerCase().includes(keyword)),
  );
  return (
    <div className="flex min-w-0 flex-col gap-[3px]">
      <span id={labelId}>{w("notify")}</span>
      <Popover open={open && !disabled} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" size="xs" variant="secondary" disabled={disabled} aria-labelledby={labelId} className="w-full min-w-0 justify-between gap-1 px-[7px] font-normal">
            <span className="truncate">{value.length ? value.map((id) => names.get(id) ?? id).join(", ") : w("chooseNotifyUsers")}</span>
            <ChevronDown className="size-3 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)]! p-1.5! text-xs leading-[1.4]" aria-labelledby={labelId}>
          <div className="flex min-w-0 flex-col gap-1">
            <Input className="h-7 px-[7px] py-[3px] text-xs md:text-xs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={w("searchNotifyUsers")} aria-label={w("searchNotifyUsers")} />
            {loading && <p role="status">{w("loadingNotifyUsers")}</p>}
            {error && <div role="alert" className="flex flex-col gap-1"><p>{w("notifyUsersFailed")}</p><p className="text-xs text-muted-foreground">{error}</p><Button type="button" size="xs" variant="secondary" onClick={() => setEpoch((n) => n + 1)}>{w("retry")}</Button></div>}
            <div className="flex max-h-48 flex-col overflow-y-auto">
              {filtered.map((user) => (
                <label key={user.id} className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded px-1 py-1 hover:bg-[var(--powerjob-hover)]">
                  <input className="m-0 size-3 shrink-0" type="checkbox" checked={value.includes(user.id)} disabled={disabled || (user.enable === false && !value.includes(user.id))} onChange={(event) => onChange(event.target.checked ? [...value, user.id] : value.filter((id) => id !== user.id))} />
                  <span className="truncate">{names.get(user.id) ?? user.id}</span>
                </label>
              ))}
              {!loading && !error && !filtered.length && <p className="text-muted-foreground">{w("noNotifyUsers")}</p>}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
