import { InputHTMLAttributes } from "react";
import { clsx } from "clsx";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      {...props}
      className={clsx(
        "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text shadow-sm",
        "placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        className,
      )}
    />
  );
}

