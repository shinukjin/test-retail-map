"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Group, Layer, Rect, Stage } from "react-konva";
import { computeSharedEdgeBorderSegments } from "./grid-cell-edge-borders";
import { clamp, PAD } from "./grid-editor-cell-draw";
import {
  FABRIC_GRID_SNAPSHOT_STORAGE_KEY,
  KONVA_GRID_SNAPSHOT_STORAGE_KEY,
  notifyKonvaGridSnapshotChanged,
} from "./grid-snapshot";
import {
  KonvaGridBorderLayer,
  KonvaGridCellFills,
  KonvaGridHeaders,
  KonvaGridSelectionLayer,
  KonvaGridTextLayer,
  KonvaGridXLayer,
} from "./KonvaEditorGridLayers";
import { gridBorderFingerprint } from "@/experiments/grid-editor/grid-border-fingerprint";
import { GridEditorSidePanel } from "@/experiments/grid-editor/GridEditorSidePanel";
import { GridEditorHeader } from "@/experiments/grid-editor/GridEditorHeader";
import { GridEditorToolbar } from "@/experiments/grid-editor/GridEditorToolbar";
import { useGridEditorKeyboard } from "@/experiments/grid-editor/useGridEditorKeyboard";
import { useGridEditorModel } from "@/experiments/grid-editor/useGridEditorModel";

const ZOOM_MIN = 0.12;
const ZOOM_MAX = 6;
const WHEEL_DELTA_CAP = 80;
const PAN_DRAG_THRESHOLD_PX = 5;

function fitTransform(
  vw: number,
  vh: number,
  worldW: number,
  worldH: number,
  pad: number,
): { scale: number; x: number; y: number } {
  if (vw <= 0 || vh <= 0 || worldW <= 0 || worldH <= 0) {
    return { scale: 1, x: pad, y: pad };
  }
  const sx = (vw - pad * 2) / worldW;
  const sy = (vh - pad * 2) / worldH;
  const scale = clamp(Math.min(sx, sy), ZOOM_MIN, ZOOM_MAX);
  const x = (vw - worldW * scale) / 2;
  const y = (vh - worldH * scale) / 2;
  return { scale, x, y };
}

type DragSession = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  lastClientX: number;
  lastClientY: number;
  pendingCellKey: string | null;
  panning: boolean;
};

export default function GridEditorKonva() {
  const persist = useMemo(
    () => ({
      storageKey: KONVA_GRID_SNAPSHOT_STORAGE_KEY,
      notifyChanged: notifyKonvaGridSnapshotChanged,
      downloadFilename: "konva-grid-editor.json",
      alternateStorageImportKey: FABRIC_GRID_SNAPSHOT_STORAGE_KEY,
    }),
    [],
  );
  const model = useGridEditorModel(persist);
  useGridEditorKeyboard(model);
  const modelRef = useRef(model);
  modelRef.current = model;

  const worldW = model.stageW;
  const worldH = model.stageH;

  const [viewport, setViewport] = useState({ w: 360, h: 280 });
  const [transform, setTransform] = useState({ scale: 1, x: 16, y: 16 });
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const lastPointerModsRef = useRef({ ctrlKey: false, metaKey: false, shiftKey: false });

  const anchors = useMemo(
    () => Array.from(model.cells.values()).filter((c) => !c.mergedInto),
    [model.cells],
  );
  const selectedKeySet = useMemo(() => new Set(model.selectedKeys), [model.selectedKeys]);
  const borderFp = useMemo(
    () => gridBorderFingerprint(anchors, model.gridStyle, model.groupStyles),
    [anchors, model.gridStyle, model.groupStyles],
  );
  const borderSegs = useMemo(
    () =>
      computeSharedEdgeBorderSegments(anchors, model.gridStyle, model.groupStyles, {
        renderDefaultBorders: true,
      }),
    [borderFp],
  );

  // 현재 뷰포트에 보이는 셀만 렌더링 (뷰포트 컬링)
  const visibleAnchors = useMemo(() => {
    const { scale, x, y } = transform;
    const cw = model.gridStyle.cellWidth;
    const ch = model.gridStyle.cellHeight;
    // 화면 좌표 → 월드 좌표 변환: worldX = (screenX - x) / scale
    const worldLeft = (-x / scale) - PAD;
    const worldRight = ((viewport.w - x) / scale) - PAD;
    const worldTop = (-y / scale) - PAD;
    const worldBottom = ((viewport.h - y) / scale) - PAD;
    // 각 방향에 1셀 여유를 두어 경계 셀이 잘리지 않게 함
    const colMin = Math.floor(worldLeft / cw) - 1;
    const colMax = Math.ceil(worldRight / cw) + 1;
    const rowMin = Math.floor(worldTop / ch) - 1;
    const rowMax = Math.ceil(worldBottom / ch) + 1;
    return anchors.filter(
      (c) =>
        c.col + (c.colspan ?? 1) > colMin &&
        c.col <= colMax &&
        c.row + (c.rowspan ?? 1) > rowMin &&
        c.row <= rowMax,
    );
  }, [anchors, transform, viewport.w, viewport.h, model.gridStyle.cellWidth, model.gridStyle.cellHeight]);

  // 뷰포트 컬링된 border segment (Line 노드 수 감소)
  const visibleBorderSegs = useMemo(() => {
    const { scale, x, y } = transform;
    const margin = 8;
    const wl = (-x / scale) - margin;
    const wr = ((viewport.w - x) / scale) + margin;
    const wt = (-y / scale) - margin;
    const wb = ((viewport.h - y) / scale) + margin;
    return {
      horizontal: borderSegs.horizontal.filter(
        (s) => s.y >= wt && s.y <= wb && s.x1 >= wl && s.x0 <= wr,
      ),
      vertical: borderSegs.vertical.filter(
        (s) => s.x >= wl && s.x <= wr && s.y1 >= wt && s.y0 <= wb,
      ),
    };
  }, [borderSegs, transform, viewport.w, viewport.h]);

  const gridBodyProps = useMemo(
    () => ({
      anchors: visibleAnchors,
      selectedKeySet,
      gridStyle: model.gridStyle,
      groupStyles: model.groupStyles,
      hideCellInteriorText: model.hideEditorCellInteriorText,
    }),
    [visibleAnchors, selectedKeySet, model.gridStyle, model.groupStyles, model.hideEditorCellInteriorText],
  );

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const pad = 12;
    const sync = () => {
      const r = el.getBoundingClientRect();
      const w = Math.floor(r.width);
      const h = Math.floor(r.height);
      if (w <= 0 || h <= 0) return;
      setViewport({ w, h });
      setTransform(fitTransform(w, h, worldW, worldH, pad));
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [worldW, worldH]);

  const applyFit = useCallback(() => {
    const pad = 12;
    setTransform(fitTransform(viewport.w, viewport.h, worldW, worldH, pad));
  }, [viewport.w, viewport.h, worldW, worldH]);

  const handleWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const dy = clamp(e.evt.deltaY, -WHEEL_DELTA_CAP, WHEEL_DELTA_CAP);
    const factor = 1 - dy * 0.0015;

    setTransform((prev) => {
      const { scale: oldScale, x: oldX, y: oldY } = prev;
      const mx = (pointer.x - oldX) / oldScale;
      const my = (pointer.y - oldY) / oldScale;
      const newScale = clamp(oldScale * factor, ZOOM_MIN, ZOOM_MAX);
      return {
        scale: newScale,
        x: pointer.x - mx * newScale,
        y: pointer.y - my * newScale,
      };
    });
  }, []);

  const zoomBy = useCallback(
    (delta: number) => {
      setTransform((prev) => {
        const cx = viewport.w / 2;
        const cy = viewport.h / 2;
        const mx = (cx - prev.x) / prev.scale;
        const my = (cy - prev.y) / prev.scale;
        const newScale = clamp(prev.scale * (1 + delta), ZOOM_MIN, ZOOM_MAX);
        return {
          scale: newScale,
          x: cx - mx * newScale,
          y: cy - my * newScale,
        };
      });
    },
    [viewport.w, viewport.h],
  );

  useEffect(() => {
    const stage = stageRef.current;
    const container = stage?.container();
    if (!container) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const st = stageRef.current;
      if (!st) return;
      lastPointerModsRef.current = {
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
      };
      const pos = st.getPointerPosition();
      if (!pos) return;
      const hit = st.getIntersection(pos);
      const nm = typeof hit?.name === "function" ? hit.name() : "";
      let pendingCellKey: string | null = null;
      if (nm.startsWith("cell-")) pendingCellKey = nm.slice("cell-".length);

      dragRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
        pendingCellKey,
        panning: false,
      };
      try {
        container.setPointerCapture(e.pointerId);
      } catch {
        /* */
      }
      e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const dist = Math.hypot(e.clientX - d.startClientX, e.clientY - d.startClientY);
      if (!d.panning && dist > PAN_DRAG_THRESHOLD_PX) d.panning = true;
      if (d.panning) {
        const dx = e.clientX - d.lastClientX;
        const dy = e.clientY - d.lastClientY;
        d.lastClientX = e.clientX;
        d.lastClientY = e.clientY;
        setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
      }
    };

    const endPointer = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      try {
        container.releasePointerCapture(e.pointerId);
      } catch {
        /* */
      }
      const m = modelRef.current;
      if (!d.panning) {
        if (d.pendingCellKey) {
          const mods = lastPointerModsRef.current;
          m.selectCell(d.pendingCellKey, m.cells, {
            additive: mods.ctrlKey || mods.metaKey,
            rangeExtend: mods.shiftKey,
          });
        } else {
          m.selectCell(null);
        }
      }
      dragRef.current = null;
    };

    container.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endPointer);
    window.addEventListener("pointercancel", endPointer);
    return () => {
      container.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endPointer);
      window.removeEventListener("pointercancel", endPointer);
    };
  }, [viewport.w, viewport.h, worldW, worldH]);

  const worldGroup = (children: React.ReactNode) => (
    <Group x={transform.x} y={transform.y} scaleX={transform.scale} scaleY={transform.scale}>
      {children}
    </Group>
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-zinc-100 dark:bg-zinc-950">
      <GridEditorHeader
        title="Konva 그리드 편집기"
        demoHref="/map-konva"
        demoLabel="도면 데모"
        alternateEditorHref="/map-fabric/editor"
        alternateEditorLabel="Fabric 편집기"
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
                zoomLabel={`${(transform.scale * 100).toFixed(0)}%`}
                canvasControls={
                  <>
                    <button type="button" onClick={applyFit} className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800">
                      맞춤
                    </button>
                    <button type="button" onClick={() => zoomBy(-0.12)} className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-900">
                      −
                    </button>
                    <button type="button" onClick={() => zoomBy(0.12)} className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-900">
                      +
                    </button>
                  </>
                }
              />
              <div ref={viewportRef} className="relative min-h-[220px] w-full flex-1 overflow-hidden bg-zinc-100 dark:bg-zinc-900/60">
                <Stage
                  ref={stageRef}
                  width={viewport.w}
                  height={viewport.h}
                  onWheel={handleWheel}
                >
                  <Layer listening>
                    {worldGroup(
                      <>
                        <Rect
                          name="grid-backdrop"
                          x={0}
                          y={0}
                          width={worldW}
                          height={worldH}
                          fill="rgba(244,244,245,0.35)"
                          stroke="#d4d4d8"
                          strokeWidth={1}
                        />
                        <KonvaGridCellFills {...gridBodyProps} />
                      </>,
                    )}
                  </Layer>
                  <Layer listening={false}>
                    {worldGroup(<KonvaGridSelectionLayer {...gridBodyProps} />)}
                  </Layer>
                  <Layer listening={false}>
                    {worldGroup(
                      <KonvaGridHeaders
                        cols={model.cols}
                        rows={model.rows}
                        cw={model.gridStyle.cellWidth}
                        ch={model.gridStyle.cellHeight}
                        show={model.showRowColHeaders}
                      />,
                    )}
                  </Layer>
                  <Layer listening={false}>
                    {worldGroup(
                      <KonvaGridBorderLayer
                        horizontal={visibleBorderSegs.horizontal}
                        vertical={visibleBorderSegs.vertical}
                      />,
                    )}
                  </Layer>
                  <Layer listening={false}>
                    {worldGroup(<KonvaGridXLayer {...gridBodyProps} />)}
                  </Layer>
                  <Layer listening={false}>
                    {worldGroup(<KonvaGridTextLayer {...gridBodyProps} />)}
                  </Layer>
                </Stage>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
