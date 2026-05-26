"use client";

import { useMemo, useRef, useState } from "react";
import { GridEditorHeader } from "@/experiments/grid-editor/GridEditorHeader";
import { GridEditorSidePanel } from "@/experiments/grid-editor/GridEditorSidePanel";
import { GridEditorToolbar } from "@/experiments/grid-editor/GridEditorToolbar";
import { useGridEditorKeyboard } from "@/experiments/grid-editor/useGridEditorKeyboard";
import { useGridEditorModel } from "@/experiments/grid-editor/useGridEditorModel";
import {
  FABRIC_GRID_SNAPSHOT_STORAGE_KEY,
  KONVA_GRID_SNAPSHOT_STORAGE_KEY,
  notifyFabricGridSnapshotChanged,
} from "@/experiments/konva/grid-snapshot";
import { FabricGridCanvas, type FabricGridCanvasControls } from "./FabricGridCanvas";

export default function FabricGridEditor() {
  const persist = useMemo(
    () => ({
      storageKey: FABRIC_GRID_SNAPSHOT_STORAGE_KEY,
      notifyChanged: notifyFabricGridSnapshotChanged,
      downloadFilename: "fabric-grid-editor.json",
      alternateStorageImportKey: KONVA_GRID_SNAPSHOT_STORAGE_KEY,
    }),
    [],
  );
  const model = useGridEditorModel(persist);
  useGridEditorKeyboard(model);
  const canvasRef = useRef<FabricGridCanvasControls>(null);
  const [zoomPct, setZoomPct] = useState(100);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-zinc-100 dark:bg-zinc-950">
      <GridEditorHeader
        title="Fabric 그리드 편집기"
        demoHref="/map-fabric"
        demoLabel="도면 데모"
        alternateEditorHref="/map-konva/editor"
        alternateEditorLabel="Konva 편집기"
        badge={
          model.hasGrid ? (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {model.cols}×{model.rows}
            </span>
          ) : null
        }
      />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <GridEditorSidePanel model={model} />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-zinc-200/90 p-2 dark:bg-zinc-900/80">
          {!model.hasGrid && (
            <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-white/60 p-6 text-center dark:border-zinc-700 dark:bg-zinc-950/40">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">그리드를 생성하세요</p>
              <p className="max-w-xs text-[11px] leading-relaxed text-zinc-500">
                왼쪽 패널에서 열·행·셀 크기를 입력한 뒤 <strong>생성</strong>을 누르세요.
              </p>
            </div>
          )}
          {model.hasGrid && (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-300 bg-white shadow-sm dark:border-zinc-600 dark:bg-zinc-950/80">
              <GridEditorToolbar
                model={model}
                zoomLabel={`${zoomPct}%`}
                canvasControls={
                  <>
                    <button
                      type="button"
                      onClick={() => canvasRef.current?.fit()}
                      className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                    >
                      맞춤
                    </button>
                    <button
                      type="button"
                      onClick={() => canvasRef.current?.zoomOut()}
                      className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={() => canvasRef.current?.zoomIn()}
                      className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => canvasRef.current?.reset()}
                      className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      1×
                    </button>
                  </>
                }
              />
              <FabricGridCanvas
                ref={canvasRef}
                hideChrome
                showRowColHeaders={model.showRowColHeaders}
                onZoomPctChange={setZoomPct}
                hasGrid={model.hasGrid}
                cols={model.cols}
                rows={model.rows}
                cells={model.cells}
                gridStyle={model.gridStyle}
                groupStyles={model.groupStyles}
                selectedKeys={model.selectedKeys}
                selectCell={model.selectCell}
                stageW={model.stageW}
                stageH={model.stageH}
                hideCellInteriorText={model.hideEditorCellInteriorText}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
