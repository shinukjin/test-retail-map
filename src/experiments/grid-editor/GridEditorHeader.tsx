"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  title: string;
  demoHref: string;
  demoLabel: string;
  alternateEditorHref: string;
  alternateEditorLabel: string;
  badge?: ReactNode;
};

export function GridEditorHeader({
  title,
  demoHref,
  demoLabel,
  alternateEditorHref,
  alternateEditorLabel,
  badge,
}: Props) {
  return (
    <header className="shrink-0 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <h1 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{title}</h1>
          {badge}
          <nav className="flex flex-wrap items-center gap-2 text-[10px]">
            <Link
              href={demoHref}
              className="rounded-full bg-sky-50 px-2 py-0.5 font-medium text-sky-700 transition hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-900/50"
            >
              {demoLabel}
            </Link>
            <Link
              href={alternateEditorHref}
              className="text-zinc-500 transition hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              {alternateEditorLabel}
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
