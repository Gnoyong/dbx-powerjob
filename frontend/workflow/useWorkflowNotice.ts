import { useEffect, useId } from "react";
import { toast } from "sonner";

export function useWorkflowNotice(
  message: string,
  kind: "error" | "warning" | "success" = "error",
) {
  const id = useId();
  useEffect(() => {
    if (message) {
      toast[kind](message, {
        id,
        duration: kind === "warning" ? Infinity : kind === "error" ? 8000 : 4000,
        closeButton: true,
      });
    } else {
      toast.dismiss(id);
    }
    return () => { toast.dismiss(id); };
  }, [id, message, kind]);
}
