import { cn } from "@/lib/utils";

const badgeVariants = {
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
  neutral: "bg-brand-rosa-claro/40 text-brand-ciruela",
} as const;

export function Badge({
  variant,
  children,
}: {
  variant: keyof typeof badgeVariants;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
        badgeVariants[variant],
      )}
    >
      {children}
    </span>
  );
}
