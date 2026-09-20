import { jobFields, label } from "../format";
import type { TranslationKey } from "../i18n";
import type { JobDetail } from "../types";
import type { T } from "../uiTypes";

export function JobInspector({
  detail,
  status,
  t,
}: {
  detail: JobDetail | null;
  status: TranslationKey;
  t: T;
}) {
  if (!detail)
    return <div className="detail-scroll empty-pane">{t(status)}</div>;
  return (
    <div className="detail-scroll">
      <table className="inspector-table">
        <tbody>
          {jobFields
            .filter(([key]) => key in detail)
            .map(([key, title]) => {
              const value = detail[key];
              const multiline =
                (typeof value === "object" && value !== null) ||
                (typeof value === "string" &&
                  (value.length > 80 || value.includes("\n")));
              return (
                <tr key={key}>
                  <th scope="row">{t(title)}</th>
                  <td>
                    {multiline ? (
                      <pre>
                        {typeof value === "object"
                          ? JSON.stringify(value, null, 2)
                          : String(value)}
                      </pre>
                    ) : typeof value === "boolean" ? (
                      t(value ? "yes" : "no")
                    ) : (
                      label(value)
                    )}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
