"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { EditorGridCell } from "@/experiments/konva/grid-editor-types";
import { ExperimentChrome } from "@/experiments/_shared/ExperimentChrome";
import { GridSalesPanel } from "@/experiments/_shared/GridSalesPanel";
import { loadSalesByShelfCode } from "@/lib/grid-sales-api";

const GridSnapshotViewer = dynamic(
  () => import("@/experiments/konva/GridSnapshotViewer"),
  { ssr: false },
);

export function KonvaExperimentEntry() {
  const [selectedCell, setSelectedCell] = useState<EditorGridCell | null>(null);
  const salesByShelfCode = useMemo(() => loadSalesByShelfCode(), []);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
      <ExperimentChrome title="Konva 조회">
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4 overflow-hidden lg:flex-row lg:items-stretch">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:max-h-[min(78dvh,calc(100svh-9.5rem))]">
            <GridSnapshotViewer onSelectionChange={setSelectedCell} />
          </div>
          <GridSalesPanel cell={selectedCell} salesByShelfCode={salesByShelfCode} />
        </div>
      </ExperimentChrome>
    </div>
  );
}
