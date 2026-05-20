import { ButtonHTMLAttributes } from "react";
import { clsx } from "clsx";

type ButtonVariant = "primary" | "secondary" | "danger" | "success" | "ghost";
type ButtonSize = "sm" | "md";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ className, variant = "secondary", size = "md", ...props }: ButtonProps) {
  const sizeClass = size === "sm" ? "px-3 py-2 text-sm" : "px-4 py-2 text-sm";

  const variantClass =
    variant === "primary"
      ? "bg-primary text-white hover:bg-primary-hover"
      : variant === "danger"
        ? "bg-danger text-white hover:bg-danger/90"
        : variant === "success"
          ? "bg-success text-white hover:bg-success/90"
          : variant === "ghost"
            ? "border-transparent bg-transparent text-text shadow-none hover:bg-surface"
            : "border border-border bg-surface text-text hover:bg-bg";

  return (
    <button
      {...props}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold shadow-sm transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60",
        sizeClass,
        variantClass,
        className,
      )}
    />
  );
}
