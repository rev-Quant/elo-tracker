"use client";

import { useState } from "react";

type Accent = "blue" | "green" | "purple" | "amber" | "rose";

const ACCENTS: Record<Accent, { label: string; value: string; glow: string }> = {
  blue:   { label: "Blue",   value: "#5b9cf5", glow: "rgba(91,156,245,0.15)" },
  green:  { label: "Green",  value: "#34d399", glow: "rgba(52,211,153,0.15)" },
  purple: { label: "Purple", value: "#a78bfa", glow: "rgba(167,139,250,0.15)" },
  amber:  { label: "Amber",  value: "#fbbf24", glow: "rgba(251,191,36,0.15)" },
  rose:   { label: "Rose",   value: "#fb7185", glow: "rgba(251,113,133,0.15)" },
};

const KEY = "elo-accent";

function load(): Accent {
  if (typeof window === "undefined") return "blue";
  return (localStorage.getItem(KEY) as Accent) ?? "blue";
}

function apply(accent: Accent) {
  const c = ACCENTS[accent];
  document.documentElement.style.setProperty("--accent", c.value);
  document.documentElement.style.setProperty("--accent-glow", c.glow);
}

/** Read from localStorage on mount so the effect is not flagged as impure. */
const initial = typeof window !== "undefined" ? load() : "blue";
if (typeof window !== "undefined") apply(initial);

export function ThemePicker() {
  const [current, setCurrent] = useState<Accent>(initial);

  function pick(accent: Accent) {
    setCurrent(accent);
    apply(accent);
    localStorage.setItem(KEY, accent);
  }

  return (
    <div className="flex items-center gap-1.5">
      {Object.entries(ACCENTS).map(([id, c]) => (
        <button
          key={id}
          type="button"
          aria-label={`${c.label} theme`}
          onClick={() => pick(id as Accent)}
          className={`grid size-7 place-items-center rounded-full border-2 transition active:scale-90 ${
            current === id ? "border-text ring-2 ring-text/20" : "border-transparent"
          }`}
          style={{ background: c.value }}
        />
      ))}
    </div>
  );
}