"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Home", exact: true },
  { href: "/estimator", label: "Estimator" },
  { href: "/market", label: "Market Analysis" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded bg-primary text-sm font-bold text-white">
            H
          </span>
          <span className="hidden sm:inline">HSBC Property Intelligence</span>
          <span className="sm:hidden">HSBC</span>
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-1">
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-ink-muted hover:bg-surface-muted hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}