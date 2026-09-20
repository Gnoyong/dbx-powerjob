import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border text-sm font-medium transition-colors outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[var(--color-primary,#3565c8)] text-[var(--color-primary-foreground,#fff)] hover:brightness-95",
        secondary: "border-[var(--color-border,#d7dce5)] bg-[var(--color-background,#fff)] text-[var(--color-foreground,#202631)] hover:bg-[var(--powerjob-hover)]",
        ghost: "border-transparent bg-transparent text-[var(--color-muted-foreground,#677282)] hover:bg-[var(--powerjob-hover)]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3",
        xs: "h-7 gap-1 px-2 text-xs",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & {
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
