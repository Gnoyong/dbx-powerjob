import * as SwitchPrimitive from "@radix-ui/react-switch";
import type * as React from "react";
import { cn } from "@/lib/utils";

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root data-slot="switch" className={cn("job-switch", className)} {...props}>
      <SwitchPrimitive.Thumb data-slot="switch-thumb" className="job-switch-thumb" />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
