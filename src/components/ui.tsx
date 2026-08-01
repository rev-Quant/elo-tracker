import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-surface p-4 ${className}`}>{children}</div>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-5">
      <h1 className="text-2xl font-semibold tracking-tight">{children}</h1>
      {sub ? <p className="mt-1 text-sm text-muted">{sub}</p> : null}
    </header>
  );
}

const buttonBase =
  "inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "ghost" }) {
  const styles = {
    primary: "bg-accent text-[#04121f] hover:brightness-110 active:brightness-95",
    secondary: "border border-border bg-surface-2 text-text hover:border-muted",
    ghost: "text-muted hover:text-text",
  }[variant];
  return <button className={`${buttonBase} ${styles} ${className}`} {...props} />;
}

export function LinkButton({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: "primary" | "secondary" }) {
  const styles = {
    primary: "bg-accent text-[#04121f]",
    secondary: "border border-border bg-surface-2 text-text",
  }[variant];
  return <Link className={`${buttonBase} ${styles} ${className}`} {...props} />;
}

export function Field({
  label,
  error,
  ...props
}: ComponentProps<"input"> & { label: string; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      <input
        className="w-full rounded-xl border border-border bg-surface-2 px-3 py-3 text-base outline-none focus:border-accent"
        {...props}
      />
      {error ? <span className="mt-1 block text-xs text-down">{error}</span> : null}
    </label>
  );
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-xl border border-down/30 bg-down/10 px-3 py-2.5 text-sm text-down"
    >
      {children}
    </p>
  );
}

/** Empty states matter for retention — spec §5 explicitly calls them out. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Card className="text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </Card>
  );
}

/** A rating delta, coloured and signed. */
export function Delta({ value, className = "" }: { value: number | null; className?: string }) {
  if (value === null) return <span className="text-muted">—</span>;
  const rounded = Math.round(value);
  if (rounded === 0) return <span className={`text-muted tnum ${className}`}>0</span>;
  return (
    <span className={`tnum ${rounded > 0 ? "text-up" : "text-down"} ${className}`}>
      {rounded > 0 ? "+" : ""}
      {rounded}
    </span>
  );
}
