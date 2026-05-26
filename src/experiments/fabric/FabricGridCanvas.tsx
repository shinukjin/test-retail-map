"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { Canvas, Point, Rect } from "fabric";
import type { EditorGridCell, EditorGridStyle, EditorGroupStyle } from "@/experiments/konva/grid-editor-types";
import type { GridSelectOptions } from "@/experiments/grid-editor/useGridEditorModel";
import { clamp, type GridCellLabelMode } from "@/experiments/konva/grid-editor-cell-draw";
import {
  destroyFabricGridRuntime,
  needsFabricStructuralRebuild,
  syncFabricGridIncremental,
  type FabricGridRuntime,
  type FabricSyncContext,
} from "./fabric-grid-sync";

const ZOOM_WHEEL_SENS = 0.00085;
const ZOOM_MIN = 0.12;
const ZOOM_MAX = 4;
const ZOOM_DELTA_CAP = 90;

export type FabricGridCanvasControls = {
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
};

type Props = {
  interactive?: boolean;
  cellLabelMode?: GridCellLabelMode;
  hideCellInteriorText?: boolean;
  showRowColHeaders?: boolean;
  hideChrome?: boolean;
  onZoomPctChange?: (pct: number) => void;
  hasGrid: boolean;
  cols: number;
  rows: number;
  cells: Map<string, EditorGridCell>;
  gridStyle: EditorGridStyle;
  groupStyles?: Record<string, EditorGroupStyle>;
  selectedKeys: string[];
  selectCell: (
    key: string | null,
    snapshot?: Map<string, EditorGridCell>,
    opts?: GridSelectOptions,
  ) => void;
  stageW: number;
  stageH: number;
};

export const FabricGridCanvas = forwardRef<FabricGridCanvasControls, Props>(function FabricGridCanvas(
  {
    interactive = true,
    cellLabelMode: cellLabelModeProp,
    hideCellInteriorText = false,
    showRowColHeaders = false,
    hideChrome = false,
    onZoomPctChange,
    hasGrid,
    cols,
    rows,
    cells,
    gridStyle,
    groupStyles = {},
    selectedKeys,
    selectCell,
    stageW,
    stageH,
  },
  ref,
) {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<FabricGridRuntime | null>(null);
  const [zoomPct, setZoomPct] = useState(100);

  const cellsRef = useRef(cells);
  const selectCellRef = useRef(selectCell);
  const prevCellsRef = useRef<Map<string, EditorGridCell> | null>(null);
  const prevGroupStylesRef = useRef<Record<string, EditorGroupStyle> | null>(null);
  const prevGridStyleRef = useRef<EditorGridStyle | null>(null);
  const prevSelectedKeysRef = useRef<string[] | null>(null);
  const prevHideTextRef = useRef<boolean | null>(null);

  useLayoutEffect(() => {
    cellsRef.current = cells;
    selectCellRef.current = selectCell;
  }, [cells, selectCell]);

  const buildSyncContext = useCallback((): FabricSyncContext => ({
    cols,
    rows,
    stageW,
    stageH,
    cells,
    gridStyle,
    groupStyles,
    selectedKeys,
    interactive,
    hideCellInteriorText,
    showRowColHeaders,
    labelMode: cellLabelModeProp ?? (interactive ? "editor" : "applied"),
  }), [
    cellLabelModeProp,
    cells,
    cols,
    gridStyle,
    groupStyles,
    hideCellInteriorText,
    interactive,
    rows,
    selectedKeys,
    showRowColHeaders,
    stageH,
    stageW,
  ]);

  useEffect(() => {
    const el = canvasElRef.current;
    if (!el || !hasGrid) {
      if (runtimeRef.current) {
        destroyFabricGridRuntime(runtimeRef.current);
        runtimeRef.current.canvas.dispose();
        runtimeRef.current = null;
      }
      return;
    }

    const canvas = new Canvas(el, {
      width: stageW,
      height: stageH,
      selection: false,
      preserveObjectStacking: true,
      stopContextMenu: true,
    });
    canvas.defaultCursor = "default";

    const hitBg = new Rect({
      left: 0,
      top: 0,
      width: stageW,
      height: stageH,
      fill: "rgba(0,0,0,0.001)",
      evented: true,
      selectable: false,
    });
    hitBg.on("mousedown", () => {
      if (interactive) selectCellRef.current(null);
    });
    canvas.add(hitBg);

    runtimeRef.current = {
      canvas,
      hitBg,
      headerTexts: [],
      cellObjs: new Map(),
      borderLines: [],
      cols,
      rows,
      stageW,
      stageH,
      borderFingerprint: "",
    };

    prevCellsRef.current = null;
    prevGroupStylesRef.current = null;
    prevGridStyleRef.current = null;
    prevSelectedKeysRef.current = null;
    prevHideTextRef.current = null;

    const onWheel = (opt: { e: WheelEvent }) => {
      const e = opt.e;
      e.preventDefault();
      e.stopPropagation();
      let zoom = canvas.getZoom();
      const dz = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), ZOOM_DELTA_CAP);
      zoom *= Math.exp(-dz * ZOOM_WHEEL_SENS);
      zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
      const p = canvas.getScenePoint(e);
      canvas.zoomToPoint(p, zoom);
      const pct = Math.round(canvas.getZoom() * 100);
      setZoomPct(pct);
      onZoomPctChange?.(pct);
    };
    canvas.on("mouse:wheel", onWheel);
    const initPct = Math.round(canvas.getZoom() * 100);
    setZoomPct(initPct);
    onZoomPctChange?.(initPct);

    return () => {
      canvas.off("mouse:wheel", onWheel);
      if (runtimeRef.current) {
        destroyFabricGridRuntime(runtimeRef.current);
        runtimeRef.current = null;
      }
      canvas.dispose();
    };
  }, [cols, hasGrid, interactive, onZoomPctChange, rows, stageH, stageW]);

  useLayoutEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !hasGrid) return;

    const ctx = buildSyncContext();
    if (needsFabricStructuralRebuild(runtime, ctx)) {
      for (const key of [...runtime.cellObjs.keys()]) {
        const objs = runtime.cellObjs.get(key)!;
        runtime.canvas.remove(objs.rect);
        if (objs.overlay) runtime.canvas.remove(objs.overlay);
        if (objs.text) runtime.canvas.remove(objs.text);
        if (objs.xLines) for (const ln of objs.xLines) runtime.canvas.remove(ln);
      }
      runtime.cellObjs.clear();
      for (const ln of runtime.borderLines) runtime.canvas.remove(ln);
      runtime.borderLines = [];
      runtime.borderFingerprint = "";
    }

    const styleAffectsAll =
      prevGridStyleRef.current !== gridStyle || prevHideTextRef.current !== hideCellInteriorText;

    syncFabricGridIncremental(
      runtime,
      ctx,
      styleAffectsAll ? null : prevCellsRef.current,
      styleAffectsAll ? null : prevGroupStylesRef.current,
      styleAffectsAll ? null : prevSelectedKeysRef.current,
      selectCellRef,
      cellsRef,
    );

    prevCellsRef.current = cells;
    prevGroupStylesRef.current = groupStyles;
    prevGridStyleRef.current = gridStyle;
    prevSelectedKeysRef.current = selectedKeys;
    prevHideTextRef.current = hideCellInteriorText;
  }, [
    hasGrid,
    cols,
    rows,
    stageW,
    stageH,
    cells,
    gridStyle,
    groupStyles,
    selectedKeys,
    interactive,
    hideCellInteriorText,
    showRowColHeaders,
    cellLabelModeProp,
    buildSyncContext,
  ]);

  const resetView = () => {
    const c = runtimeRef.current?.canvas;
    if (!c) return;
    c.setViewportTransform([1, 0, 0, 1, 0, 0]);
    c.setZoom(1);
    c.requestRenderAll();
    setZoomPct(100);
    onZoomPctChange?.(100);
  };

  const zoomTowardGridCenter = (factor: number) => {
    const c = runtimeRef.current?.canvas;
    if (!c) return;
    const next = clamp(c.getZoom() * factor, ZOOM_MIN, ZOOM_MAX);
    c.zoomToPoint(new Point(stageW / 2, stageH / 2), next);
    c.requestRenderAll();
    const pct = Math.round(c.getZoom() * 100);
    setZoomPct(pct);
    onZoomPctChange?.(pct);
  };

  const fitScrollArea = () => {
    const c = runtimeRef.current?.canvas;
    const wrap = wrapRef.current;
    if (!c || !wrap) return;
    const rw = wrap.clientWidth - 6;
    const rh = wrap.clientHeight - 6;
    if (rw <= 0 || rh <= 0) return;
    const z = clamp(Math.min(rw / stageW, rh / stageH) * 0.96, ZOOM_MIN, ZOOM_MAX);
    c.setZoom(z);
    c.setViewportTransform([z, 0, 0, z, (wrap.clientWidth - stageW * z) / 2, (wrap.clientHeight - stageH * z) / 2]);
    c.requestRenderAll();
    const pct = Math.round(c.getZoom() * 100);
    setZoomPct(pct);
    onZoomPctChange?.(pct);
  };

  useImperativeHandle(ref, () => ({
    fit: fitScrollArea,
    zoomIn: () => zoomTowardGridCenter(1.12),
    zoomOut: () => zoomTowardGridCenter(1 / 1.12),
    reset: resetView,
  }));

  if (!hasGrid) return null;

  return (
    <div className={`inline-flex min-h-0 min-w-0 max-w-full flex-1 flex-col ${hideChrome ? "h-full" : "gap-1"}`}>
      {!hideChrome ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={fitScrollArea}
            className="rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
          >
            스크롤 영역에 맞춤
          </button>
          <button
            type="button"
            onClick={() => zoomTowardGridCenter(1 / 1.12)}
            className="rounded border border-zinc-300 px-2 py-0.5 text-[10px] dark:border-zinc-600"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => zoomTowardGridCenter(1.12)}
            className="rounded border border-zinc-300 px-2 py-0.5 text-[10px] dark:border-zinc-600"
          >
            +
          </button>
          <button
            type="button"
            onClick={resetView}
            className="rounded border border-zinc-400 px-2 py-0.5 text-[10px] text-zinc-700 dark:border-zinc-500 dark:text-zinc-200"
          >
            1×
          </button>
          <span className="text-[10px] tabular-nums text-zinc-500">{zoomPct}%</span>
          <span className="text-[10px] text-zinc-500">
            {interactive ? "휠: 줌 · 배경 클릭: 선택 해제" : "휠: 줌 (조회 전용)"}
          </span>
        </div>
      ) : null}
      <div
        ref={wrapRef}
        className={`min-h-0 min-w-0 flex-1 overflow-auto bg-zinc-100 dark:bg-zinc-900/80 ${hideChrome ? "h-full" : "rounded border border-zinc-300 dark:border-zinc-600"}`}
      >
        <canvas ref={canvasElRef} className="block max-w-full" />
      </div>
    </div>
  );
});
