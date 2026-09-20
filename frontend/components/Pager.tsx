import { Button } from "./ui/button";
import type { Page } from "../types";
import type { T } from "../uiTypes";

export function Pager({
  page,
  onPage,
  t,
  count = true,
}: {
  page: Page<unknown> | null;
  onPage: (index: number) => void;
  t: T;
  count?: boolean;
}) {
  const index = page?.index ?? 0;
  const totalPages = page?.totalPages ?? 0;
  return (
    <div className="pager">
      <span>
        {count && page ? t("total", { count: page.totalItems || 0 }) : ""}
      </span>
      <Button
        type="button"
        variant="ghost"
        disabled={!page || index <= 0}
        onClick={() => onPage(index - 1)}
      >
        {t("previous")}
      </Button>
      <span>{totalPages ? `${index + 1} / ${totalPages}` : "0 / 0"}</span>
      <Button
        type="button"
        variant="ghost"
        disabled={!page || index + 1 >= totalPages}
        onClick={() => onPage(index + 1)}
      >
        {t("next")}
      </Button>
    </div>
  );
}
