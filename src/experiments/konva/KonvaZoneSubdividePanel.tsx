"use client";

import type { GridEditorModel } from "@/experiments/grid-editor/useGridEditorModel";
import { ZoneSubdivideForm } from "@/experiments/_shared/ZoneSubdivideForm";

type Props = { model: GridEditorModel };

export function KonvaZoneSubdividePanel({ model }: Props) {
  const { hasGrid, selectedKeys, selected, subdivideSelectedZone } = model;

  if (!hasGrid || selectedKeys.length !== 1 || !selected || selected.mergedInto) {
    return null;
  }

  const spanCols = selected.colspan;
  const spanRows = selected.rowspan;
  if (spanCols === 1 && spanRows === 1) {
    return (
      <div className="shrink-0 border-b border-zinc-200 px-2.5 py-1.5 dark:border-zinc-800">
        <p className="text-[9px] text-zinc-500">2×2 이상 병합 구획을 선택하면 세분화할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-b border-zinc-200 px-2.5 py-1.5 dark:border-zinc-800">
      <ZoneSubdivideForm
        parent={{
          code: selected.groupCode,
          label: selected.cellName,
          bayCode: selected.shelfCode,
        }}
        spanCols={spanCols}
        spanRows={spanRows}
        onApply={subdivideSelectedZone}
        labels={{ code: "하위 구역 코드", label: "칸 이름", bay: "매대 코드" }}
      />
    </div>
  );
}
