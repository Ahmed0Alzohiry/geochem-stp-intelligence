import { cn } from "@/lib/utils";

const variants = {
  primary:
    "bg-teal-700 text-white hover:bg-teal-600 focus-visible:outline-teal-700",
  secondary:
    "border border-steel-200 bg-white text-navy-900 hover:bg-steel-50 focus-visible:outline-navy-900",
  ghost: "text-navy-900 hover:bg-steel-100",
} as const;

export function Button({
  children,
  className,
  variant = "primary",
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
