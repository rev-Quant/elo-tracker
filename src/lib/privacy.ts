"use client";

import { useState } from "react";

const KEY = "elo-hide-rating";

function load(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(KEY) === "1";
}

export function useHideRating() {
  const [hidden, setHidden] = useState(load);

  function toggle() {
    const next = !hidden;
    setHidden(next);
    localStorage.setItem(KEY, next ? "1" : "0");
  }

  return { hidden, toggle };
}