import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Board Game ELO Tracker",
  description: "Track ratings for the games you play with friends.",
};

export const viewport: Viewport = {
  themeColor: "#0b0d10",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-bg text-text">
        {/* Mobile-first: a single narrow column, centred on larger screens. */}
        <div className="mx-auto w-full max-w-md px-4 pb-24 pt-6">{children}</div>
      </body>
    </html>
  );
}
