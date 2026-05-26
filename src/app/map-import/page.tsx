"use client";

import dynamic from "next/dynamic";

const FloorImportPage = dynamic(
  () => import("@/experiments/floor-import/FloorImportPage"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-zinc-400">
        로딩 중…
      </div>
    ),
  },
);

export default function MapImportPage() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <FloorImportPage />
    </div>
  );
}
