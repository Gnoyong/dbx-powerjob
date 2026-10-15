import { CircleAlert, LoaderCircle, SearchX } from "lucide-react";

export function ListPlaceholder({
  title,
  description,
  state = "empty",
}: {
  title: string;
  description?: string;
  state?: "empty" | "loading" | "error";
}) {
  const Icon =
    state === "loading"
      ? LoaderCircle
      : state === "error"
        ? CircleAlert
        : SearchX;
  return (
    <div className="list-placeholder" role="status">
      <span
        className={`list-placeholder-icon${state === "loading" ? " list-placeholder-icon-loading" : ""}`}
        aria-hidden="true"
      >
        <Icon size={22} strokeWidth={1.6} />
      </span>
      <strong>{title}</strong>
      {description && <span>{description}</span>}
    </div>
  );
}
