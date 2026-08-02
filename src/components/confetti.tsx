"use client";

import { useEffect, useRef, useCallback } from "react";

interface Particle {
  x: number; y: number; vx: number; vy: number;
  color: string; size: number; rotation: number; rotationSpeed: number;
  shape: "rect" | "circle";
}

const COLORS = ["#5b9cf5", "#34d399", "#fbbf24", "#a78bfa", "#fb7185", "#60a5fa", "#f472b6"];
const PARTICLE_COUNT = 80;

/**
 * Canvas-based confetti burst. Fires once when `trigger` flips to true.
 * No dependencies — renders directly to a full-screen canvas overlay.
 */
export function Confetti({ trigger }: { trigger: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);
  const firedRef = useRef(false);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let alive = false;
    for (const p of particlesRef.current) {
      p.x += p.vx;
      p.vy += 0.15; // gravity
      p.y += p.vy;
      p.rotation += p.rotationSpeed;
      p.vx *= 0.99; // drag

      if (p.y > canvas.height + 20) continue;
      alive = true;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = Math.max(0, 1 - (p.y - canvas.height * 0.5) / (canvas.height * 0.5));
      ctx.fillStyle = p.color;

      if (p.shape === "rect") {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    if (alive) {
      rafRef.current = requestAnimationFrame(animate);
    } else {
      // Hide canvas when done
      canvas.style.display = "none";
      particlesRef.current = [];
    }
  }, []);

  useEffect(() => {
    if (!trigger || firedRef.current) return;
    firedRef.current = true;

    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.display = "block";

    const cx = canvas.width / 2;
    const cy = canvas.height * 0.3;

    particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: cx,
      y: cy,
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() - 2) * 10,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 6 + Math.random() * 8,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.3,
      shape: (Math.random() > 0.5 ? "rect" : "circle") as "rect" | "circle",
    }));

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(animate);
  }, [trigger, animate]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[100]"
      style={{ display: "none" }}
    />
  );
}