"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/map-import", label: "도면 가져오기" },
  { href: "/map-konva", label: "Konva 조회" },
  { href: "/map-konva/editor", label: "Konva 편집" },
  { href: "/map-fabric", label: "Fabric 조회" },
  { href: "/map-fabric/editor", label: "Fabric 편집" },
] as const;

export function AppTopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 shrink-0 border-b border-zinc-200/90 bg-white/90 px-3 py-2 shadow-sm backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex w-full max-w-[1920px] flex-wrap items-center justify-between gap-2">
        <Link
          href="/map-konva"
          className="shrink-0 text-sm font-semibold tracking-tight text-zinc-900 transition hover:text-zinc-600 dark:text-zinc-50 dark:hover:text-zinc-300"
        >
          매장 도면
        </Link>
        <nav
          className="flex flex-wrap items-center gap-1 sm:gap-1.5"
          aria-label="주요 메뉴"
        >
          {items.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-2 py-1 text-[11px] font-medium transition sm:px-2.5 sm:text-xs ${
                  active
                    ? "bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
