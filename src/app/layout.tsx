import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/react";
import { ThemePicker } from "@/components/theme-picker";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Board Game ELO Tracker — Who's actually winning?",
    template: "%s — Board Game ELO Tracker",
  },
  description:
    "Track OpenSkill ratings across every board game your group plays. Log matches in 10 seconds. FFA or teams. Free forever.",
  keywords: ["board game", "elo", "rating", "tracker", "openskill", "leaderboard"],
  openGraph: {
    title: "Board Game ELO Tracker",
    description: "Track ratings across every game your group plays. Settle it with data.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#06080b",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" />
      </head>
      <body className="min-h-dvh bg-bg text-text">
        <div className="mx-auto w-full max-w-lg px-5 pb-24 pt-6">{children}</div>
        <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-bg/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-lg items-center justify-between px-5 py-2">
            <span className="text-[0.625rem] font-semibold uppercase tracking-[0.15em] text-muted-dim">Theme</span>
            <ThemePicker />
          </div>
        </nav>
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute left-1/4 top-0 h-96 w-96 -translate-y-1/2 rounded-full bg-accent/5 blur-3xl" />
          <div className="absolute right-1/4 bottom-0 h-80 w-80 translate-y-1/2 rounded-full bg-accent/3 blur-3xl" />
        </div>
        <Analytics />
      </body>
    </html>
  );
}