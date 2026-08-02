"use client";

import { useEffect, useState, useRef } from "react";

/**
 * Animated number that ticks from one value to another.
 * Like a slot-machine or scoreboard counter — spec asks for
 * "animated number counters that tick up or down."
 */
export function TickerNumber({
  value,
  duration = 800,
  className = "",
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  const raf = useRef<number>(0);

  useEffect(() => {
    if (prev.current === value) return;
    const from = prev.current;
    const to = value;
    prev.current = value;

    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const current = Math.round(from + (to - from) * eased);
      setDisplay(current);
      if (progress < 1) raf.current = requestAnimationFrame(tick);
    }
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);

  return (
    <span className={`tabular-nums tracking-[-0.01em] ${className}`}>{display}</span>
  );
}

/**
 * Floating delta badge — "+18" or "-12" that pops up and fades away.
 * Spec: "floating differential badges that briefly pop up and float upward."
 */
export function FloatingDelta({
  value,
  onDone,
}: {
  value: number;
  onDone?: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(() => onDone?.(), 2000);
    return () => clearTimeout(t);
  }, [onDone]);

  const positive = value >= 0;
  return (
    <span
      className="pointer-events-none absolute right-2 top-1/2 z-10 -translate-y-full animate-[float-up_2s_ease-out_forwards] select-none text-sm font-extrabold"
      style={{
        color: positive ? "var(--up)" : "var(--down)",
        textShadow: positive
          ? "0 0 12px var(--up-glow)"
          : "0 0 12px var(--down-glow)",
      }}
    >
      {positive ? "+" : ""}
      {Math.round(value)}
    </span>
  );
}

/**
 * Mini sparkline bar chart showing recent rating trajectory.
 * Spec: "sparkline mini-graphs inside each player's leaderboard row."
 */
export function Sparkline({
  points,
  width = 60,
  height = 20,
  className = "",
}: {
  points: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((p - min) / range) * (height - 2) - 1;
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`shrink-0 overflow-visible ${className}`}
      role="img"
      aria-label="Rating trend"
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-accent"
      />
    </svg>
  );
}

/**
 * Rank tier badge based on display rating thresholds.
 * Spec: "dynamic rank tier badges (Bronze, Silver, Gold, etc.)."
 */
export function TierBadge({ rating }: { rating: number }) {
  const tier =
    rating >= 1800 ? { label: "Master", color: "#a78bfa", bg: "rgba(167,139,250,0.15)" }
    : rating >= 1600 ? { label: "Diamond", color: "#60a5fa", bg: "rgba(96,165,250,0.15)" }
    : rating >= 1400 ? { label: "Platinum", color: "#34d399", bg: "rgba(52,211,153,0.15)" }
    : rating >= 1200 ? { label: "Gold", color: "#fbbf24", bg: "rgba(251,191,36,0.15)" }
    : rating >= 1050 ? { label: "Silver", color: "#cbd5e1", bg: "rgba(203,213,225,0.12)" }
    : { label: "Bronze", color: "#d97706", bg: "rgba(217,119,6,0.15)" };

  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.08em]"
      style={{ color: tier.color, background: tier.bg }}
    >
      {tier.label}
    </span>
  );
}