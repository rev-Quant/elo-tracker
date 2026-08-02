import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/* ---- Layout primitives -------------------------------------------------- */

export function Card({
  children,
  className = "",
  noPadding,
  glow,
}: {
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
  glow?: boolean;
}) {
  return (
    <div
      className={`card-hover rounded-xl border border-border bg-surface ${!noPadding ? "p-4" : ""} ${
        glow ? "border-accent/30 shadow-[0_0_20px_-8px_var(--accent-glow)]" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-dim">
      {children}
    </h2>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-[1.65rem] font-bold leading-tight tracking-[-0.02em]">{children}</h1>
      {sub ? <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">{sub}</p> : null}
    </header>
  );
}

/* ---- Buttons ------------------------------------------------------------- */

const buttonBase =
  "inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold tracking-[-0.01em] transition-all duration-150 disabled:pointer-events-none disabled:opacity-40";

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm";
}) {
  const variants = {
    primary:
      "bg-accent text-slate-900 hover:brightness-110 active:brightness-100 active:scale-[0.98] shadow-[0_2px_8px_-2px_var(--accent-glow)]",
    secondary:
      "bg-surface-2 text-text border border-border hover:border-border-accent hover:bg-surface-3 active:scale-[0.98]",
    ghost: "text-muted hover:text-text hover:bg-surface-2",
    danger: "bg-down/15 text-down border border-down/20 hover:bg-down/20 active:scale-[0.98]",
  };
  const sizes = {
    md: buttonBase,
    sm: `${buttonBase} py-2 text-xs`,
  };
  return (
    <button className={`${sizes[size]} ${variants[variant]} ${className}`} {...props} />
  );
}

export function LinkButton({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: "primary" | "secondary" }) {
  const variants = {
    primary:
      "bg-accent text-slate-900 hover:brightness-110 active:scale-[0.98] shadow-[0_2px_8px_-2px_var(--accent-glow)]",
    secondary:
      "bg-surface-2 text-text border border-border hover:border-border-accent hover:bg-surface-3 active:scale-[0.98]",
  };
  return (
    <Link
      className={`${buttonBase} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

/* ---- Form fields -------------------------------------------------------- */

export function Field({
  label,
  error,
  ...props
}: ComponentProps<"input"> & { label: string; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-dim">
        {label}
      </span>
      <input
        className="w-full rounded-lg border border-border bg-surface-2 px-3.5 py-3 text-[0.875rem] outline-none transition-colors placeholder:text-muted-dim focus:border-accent focus:ring-2 focus:ring-accent/20"
        {...props}
      />
      {error ? <span className="mt-1 block text-xs text-down">{error}</span> : null}
    </label>
  );
}

/* ---- Feedback ------------------------------------------------------------ */

export function ErrorBanner({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div role="alert" className="rounded-lg border border-down/20 bg-down/5 px-3.5 py-3 text-[0.8125rem] leading-relaxed text-down">
      {children}
    </div>
  );
}

export function SuccessBanner({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="rounded-lg border border-up/20 bg-up/5 px-3.5 py-3 text-[0.8125rem] leading-relaxed text-up">
      {children}
    </div>
  );
}

/* ---- Empty state (retention-critical per spec §5) ------------------------ */

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: string;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Card className="text-center">
      {icon ? <p className="mb-3 text-3xl">{icon}</p> : null}
      <p className="text-[0.9375rem] font-semibold">{title}</p>
      <p className="mx-auto mt-1.5 max-w-xs text-[0.8125rem] leading-relaxed text-muted">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </Card>
  );
}

/* ---- Rating -------------------------------------------------------------- */

export function HeroRating({ value }: { value: number }) {
  return (
    <span className="text-[3.25rem] font-extrabold leading-none tracking-[-0.03em] tnum tabular-nums select-none">
      {Math.round(value)}
    </span>
  );
}

export function Delta({ value, className = "" }: { value: number | null; className?: string }) {
  if (value === null) return <span className="text-muted-dim">—</span>;
  const rounded = Math.round(value);
  if (rounded === 0) return <span className={`text-muted-dim tnum ${className}`}>0</span>;
  return (
    <span
      className={`inline-flex items-center gap-0.5 tnum font-semibold tracking-[-0.01em] ${
        rounded > 0 ? "text-up" : "text-down"
      } ${className}`}
    >
      {rounded > 0 ? (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="shrink-0">
          <path d="M4.5 2v6h1V2H4.5Z" />
          <path d="M3 3.5 5 1l2 2.5H3Z" />
        </svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="shrink-0">
          <path d="M4.5 8V2h1v6H4.5Z" />
          <path d="M3 6.5 5 9l2-2.5H3Z" />
        </svg>
      )}
      {Math.abs(rounded)}
    </span>
  );
}

/* ---- Win-rate bar ------------------------------------------------------- */

export function WinRateBar({ wins, losses, className = "" }: { wins: number; losses: number; className?: string }) {
  const total = wins + losses;
  if (total === 0) return null;
  const pct = Math.round((wins / total) * 100);
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 text-[0.6875rem] font-medium tabular-nums text-muted-dim">
        {pct}%
      </span>
    </div>
  );
}

/* ---- Chip / tag ---------------------------------------------------------- */

export function Chip({
  active,
  children,
  onClick,
  className = "",
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const Component = onClick ? "button" : "span";
  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[0.8125rem] font-medium transition-all duration-150 ${
        active
          ? "border-accent/50 bg-accent/10 text-accent"
          : "border-border text-muted hover:border-muted-dim hover:text-text-dim"
      } ${onClick ? "cursor-pointer active:scale-95" : ""} ${className}`}
    >
      {children}
    </Component>
  );
}

/* ---- Skeleton loader ----------------------------------------------------- */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-shimmer rounded-lg ${className}`} />;
}