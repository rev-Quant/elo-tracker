"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  const links = [
    { href: "/", label: "Home", icon: HomeIcon },
    { href: "/groups", label: "Groups", icon: GroupsIcon },
    { href: "/discover", label: "Discover", icon: DiscoverIcon },
  ];

  // Only show on non-admin pages
  if (pathname.startsWith("/admin")) return null;

  return (
    <nav className="fixed bottom-14 left-0 right-0 z-40 border-t border-border bg-bg/90 backdrop-blur-xl safe-area-bottom">
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-1.5">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex flex-col items-center gap-1 px-3 py-1 text-[0.625rem] font-medium text-muted-dim hover:text-muted"
          aria-label="Go back"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12 5 7 10l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Back</span>
        </button>
        {links.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-1 px-3 py-1 text-[0.625rem] font-medium transition-colors ${
                active ? "text-accent" : "text-muted-dim hover:text-muted"
              }`}
            >
              <Icon active={active} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill={active ? "currentColor" : "none"}>
      <path d="M3 8.5 10 3l7 5.5V17H3V8.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 17v-5h4v5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function GroupsIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 16c0-2.761 2.239-5 5-5s5 2.239 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="14" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 16c0-1.657 1.343-3 3-3s3 1.343 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function DiscoverIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1 10h18M10 1v18" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="10" r="3" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}