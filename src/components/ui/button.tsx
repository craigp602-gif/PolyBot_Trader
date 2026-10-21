import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const styles = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
  {
    variants: {
      variant: {
        brass: "bg-brass text-brass-ink hover:bg-brass/90",
        ghost: "border border-line bg-panel text-paper hover:bg-panel-2",
        danger: "border border-down/50 bg-panel text-down hover:bg-down/10",
      },
    },
    defaultVariants: { variant: "ghost" },
  },
);

export function Button({
  className,
  variant,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof styles>) {
  return <button type={type} className={cn(styles({ variant }), className)} {...props} />;
}
