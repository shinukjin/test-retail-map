"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { EditorGridCell } from "@/experiments/konva/grid-editor-types";
import { ExperimentChrome } from "@/experiments/_shared/ExperimentChrome";
import { GridSalesPanel } from "@/experiments/_shared/GridSalesPanel";
import { loadSalesByShelfCode } from "@/lib/grid-sales-api";

const FabricGridSnapshotViewer = dynamic(
  () => import("@/experiments/fabric/FabricGridSnapshotViewer"),
  { ssr: false },
);

export function FabricExperimentEntry() {
  const [selectedCell, setSelectedCell] = useState<EditorGridCell | null>(null);
  const salesByShelfCode = useMemo(() => loadSalesByShelfCode(), []);

  return (
    <div className="w-full min-w-0">
      <ExperimentChrome title="Fabric 조회">
        <div className="flex w-full min-w-0 flex-col gap-4 lg:flex-row lg:items-stretch">
          <div className="min-w-0 flex-1">
            <FabricGridSnapshotViewer onSelectionChange={setSelectedCell} />
          </div>
          <GridSalesPanel cell={selectedCell} salesByShelfCode={salesByShelfCode} />
        </div>
      </ExperimentChrome>
    </div>
  );
}
