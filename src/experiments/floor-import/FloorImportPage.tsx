"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FloorPlanSnapshot } from "@/domain/floor-plan-snapshot";
import {
  KONVA_GRID_SNAPSHOT_STORAGE_KEY,
  notifyKonvaGridSnapshotChanged,
  parseEditorGridSnapshot,
  snapshotToJsonString as gridSnapshotToJson,
} from "@/experiments/konva/grid-snapshot";
import { floorPlanToGrid } from "@/lib/floor-plan-to-grid";
import { FloorImportSidePanel } from "./FloorImportSidePanel";
import { FloorPlanCanvas } from "./FloorPlanCanvas";
import { useFloorImportModel } from "./useFloorImportModel";

export default function FloorImportPage() {
  const router = useRouter();
  const model = useFloorImportModel();
  const [gridCols, setGridCols] = useState(20);
  const [gridRows, setGridRows] = useState(15);
  const jsonFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        model.undo();
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "z")
      ) {
        e.preventDefault();
        model.redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [model]);

  useEffect(() => {
    if (!model.floorPlan) return;
    const cols = Math.max(10, Math.min(60, Math.round(model.floorPlan.width / model.floorPlan.height * gridRows)));
    queueMicrotask(() => setGridCols(cols));
  }, [gridRows, model.floorPlan]);

  const handleShelfDragEnd = useCallback(
    (id: string, x: number, y: number) => {
      model.updateShelf(id, { x, y });
    },
    [model],
  );

  const handleShelfTransformEnd = useCallback(
    (id: string, x: number, y: number, w: number, h: number) => {
      model.updateShelf(id, { x, y, width: w, height: h });
    },
    [model],
  );

  const handleSendToGrid = useCallback(() => {
    if (!model.floorPlan || model.shelves.length === 0) return;
    const snap: FloorPlanSnapshot = {
      version: 2,
      floorPlan: model.floorPlan,
      shelves: model.shelves,
      ...(model.analysisMeta ? { analysisMeta: model.analysisMeta } : {}),
    };
    const gridSnap = floorPlanToGrid(snap, { cols: gridCols, rows: gridRows });
    const validated = parseEditorGridSnapshot(gridSnap);
    if (!validated) {
      alert("격자 변환에 실패했습니다. 열·행 수를 조정해 보세요.");
      return;
    }
    localStorage.setItem(KONVA_GRID_SNAPSHOT_STORAGE_KEY, gridSnapshotToJson(validated));
    notifyKonvaGridSnapshotChanged();
    router.push("/map-konva/editor");
  }, [model.floorPlan, model.shelves, model.analysisMeta, gridCols, gridRows, router]);

  const handleJsonImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const ok = model.importFromJson(String(reader.result ?? ""));
        if (!ok) alert("올바른 FloorPlanSnapshot JSON 파일이 아닙니다.");
      };
      reader.readAsText(file, "utf-8");
    },
    [model],
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-zinc-100 dark:bg-zinc-950">
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">도면 가져오기</h1>
        {model.floorPlan && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">
            {model.floorPlan.width} × {model.floorPlan.height}px · {model.shelves.length}개 영역
          </span>
        )}
        {model.analysisMeta && (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
            AI 분석 완료 ({model.analysisMeta.model})
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={model.saveJson}
            disabled={!model.floorPlan}
            className="rounded-md bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            JSON 저장
          </button>
          <button
            type="button"
            onClick={() => jsonFileInputRef.current?.click()}
            className="rounded-md border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            JSON 불러오기
          </button>
          <button
            type="button"
            onClick={model.loadFromStorage}
            className="rounded-md border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            마지막 저장
          </button>
          <input
            ref={jsonFileInputRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={handleJsonImport}
          />
          <span className="mx-0.5 hidden h-4 w-px bg-zinc-200 dark:bg-zinc-700 sm:inline" />
          <a
            href="/map-konva/editor"
            className="text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            Konva 편집기
          </a>
        </div>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <FloorImportSidePanel
          model={model}
          gridCols={gridCols}
          gridRows={gridRows}
          onGridColsChange={setGridCols}
          onGridRowsChange={setGridRows}
          onSendToGrid={handleSendToGrid}
        />
        <main className="min-h-0 flex-1 overflow-hidden">
          <FloorPlanCanvas
            model={model}
            onShelfDragEnd={handleShelfDragEnd}
            onShelfTransformEnd={handleShelfTransformEnd}
          />
        </main>
      </div>
    </div>
  );
}
