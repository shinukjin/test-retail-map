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
  KonvaGridResizeHandles,
  KonvaGridSelectionLayer,
  KonvaGridTextLayer,
  KonvaGridXLayer,
} from "./KonvaEditorGridLayers";
import { GridEditorHeader } from "@/experiments/grid-editor/GridEditorHeader";
import { GridEditorToolbar } from "@/experiments/grid-editor/GridEditorToolbar";
import { resolveAnchorCell } from "@/experiments/grid-editor/grid-inquiry-utils";
import {
  buildResizePreview,
  resolveResizeSpec,
  type ResizeHandle,
  type ResizePreview,
  type ResizeSpec,
} from "@/experiments/grid-editor/grid-resize-utils";
import { rectangularCellKeys, selectionBoundsFromKeys } from "@/experiments/grid-editor/grid-selection-utils";
import { KonvaEditorSidePanel } from "./KonvaEditorSidePanel";
import { KonvaGridPersistControls } from "./KonvaGridPersistControls";
import { useGridEditorKeyboard } from "@/experiments/grid-editor/useGridEditorKeyboard";
import { useGridEditorModel } from "@/experiments/grid-editor/useGridEditorModel";
import { editorCellKey, type EditorGridCell } from "@/experiments/konva/grid-editor-types";

const ZOOM_MIN = 0.12;
const ZOOM_MAX = 6;
const WHEEL_DELTA_CAP = 80;
const PAN_DRAG_THRESHOLD_PX = 5;
const LONG_PRESS_MS = 150;
const LONG_PRESS_MOVE_CANCEL_PX = 12;

type GridBounds = { r0: number; r1: number; c0: number; c1: number };

type CellMovePreview = {
  originBounds: GridBounds;
  ghostWorldX: number;
  ghostWorldY: number;
  ghostWidth: number;
  ghostHeight: number;
  dropRow: number;
  dropCol: number;
  deltaRow: number;
  deltaCol: number;
  valid: boolean;
  sourceKeys: Set<string>;
};

type CellMoveSession = {
  moveKeys: string[];
  originBounds: GridBounds;
  grabRow: number;
  grabCol: number;
  grabOffsetX: number;
  grabOffsetY: number;
  ghostWidth: number;
  ghostHeight: number;
};

function clientToStageXY(clientX: number, clientY: number, container: HTMLElement) {
  const rect = container.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function stageToWorld(
  stageX: number,
  stageY: number,
  transform: { scale: number; x: number; y: number },
) {
  return {
    x: (stageX - transform.x) / transform.scale,
    y: (stageY - transform.y) / transform.scale,
  };
}

function clientToWorld(
  clientX: number,
  clientY: number,
  container: HTMLElement,
  transform: { scale: number; x: number; y: number },
) {
  const stage = clientToStageXY(clientX, clientY, container);
  return stageToWorld(stage.x, stage.y, transform);
}

function clientToGridCell(
  clientX: number,
  clientY: number,
  container: HTMLElement,
  transform: { scale: number; x: number; y: number },
  cellWidth: number,
  cellHeight: number,
  cols: number,
  rows: number,
): { row: number; col: number } | null {
  const world = clientToWorld(clientX, clientY, container, transform);
  const gx = world.x - PAD;
  const gy = world.y - PAD;
  if (gx < 0 || gy < 0) return null;
  const col = Math.floor(gx / cellWidth);
  const row = Math.floor(gy / cellHeight);
  if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
  return { row, col };
}


function parseResizeHandle(name: string): ResizeHandle | null {
  if (name === "resize-se") return "se";
  if (name === "resize-e") return "e";
  if (name === "resize-s") return "s";
  return null;
}

function resizeCursor(handle: ResizeHandle): string {
  if (handle === "se") return "nwse-resize";
  if (handle === "e") return "ew-resize";
  return "ns-resize";
}

function isCellInSelection(
  cellKey: string,
  selectedKeys: string[],
  cells: Map<string, EditorGridCell>,
): boolean {
  if (selectedKeys.length === 0) return false;
  const anchor = resolveAnchorCell(cells, cellKey);
  if (!anchor) return false;
  const selBounds = selectionBoundsFromKeys(selectedKeys, cells);
  if (!selBounds) return false;
  const re = anchor.row + anchor.rowspan - 1;
  const ce = anchor.col + anchor.colspan - 1;
  return (
    anchor.row >= selBounds.r0 &&
    re <= selBounds.r1 &&
    anchor.col >= selBounds.c0 &&
    ce <= selBounds.c1
  );
}

function resolveMoveKeys(
  pendingCellKey: string,
  selectedKeys: string[],
  cells: Map<string, EditorGridCell>,
  cols: number,
  rows: number,
): string[] | null {
  const anchor = resolveAnchorCell(cells, pendingCellKey);
  if (!anchor) return null;
  if (isCellInSelection(pendingCellKey, selectedKeys, cells)) return selectedKeys;
  return rectangularCellKeys(
    cols,
    rows,
    editorCellKey(anchor.row, anchor.col),
    editorCellKey(anchor.row + anchor.rowspan - 1, anchor.col + anchor.colspan - 1),
  );
}

function buildCellMovePreview(
  session: CellMoveSession,
  clientX: number,
  clientY: number,
  container: HTMLElement,
  transform: { scale: number; x: number; y: number },
  cellWidth: number,
  cellHeight: number,
  cols: number,
  rows: number,
): CellMovePreview | null {
  const world = clientToWorld(clientX, clientY, container, transform);
  const ghostWorldX = world.x - session.grabOffsetX;
  const ghostWorldY = world.y - session.grabOffsetY;
  const grid = clientToGridCell(clientX, clientY, container, transform, cellWidth, cellHeight, cols, rows);
  if (!grid) return null;
  const deltaRow = grid.row - session.grabRow;
  const deltaCol = grid.col - session.grabCol;
  return {
    originBounds: session.originBounds,
    ghostWorldX,
    ghostWorldY,
    ghostWidth: session.ghostWidth,
    ghostHeight: session.ghostHeight,
    dropRow: session.originBounds.r0 + deltaRow,
    dropCol: session.originBounds.c0 + deltaCol,
    deltaRow,
    deltaCol,
    valid: isMoveDeltaValid(session.originBounds, deltaRow, deltaCol, rows, cols),
    sourceKeys: new Set(session.moveKeys),
  };
}

function isMoveDeltaValid(bounds: GridBounds, deltaRow: number, deltaCol: number, rows: number, cols: number): boolean {
  const tr0 = bounds.r0 + deltaRow;
  const tc0 = bounds.c0 + deltaCol;
  const tr1 = bounds.r1 + deltaRow;
  const tc1 = bounds.c1 + deltaCol;
  return tr0 >= 0 && tc0 >= 0 && tr1 < rows && tc1 < cols;
}

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

type CellResizeSession = {
  spec: ResizeSpec;
  handle: ResizeHandle;
  resizeKeys: string[];
};

type DragSession = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  lastClientX: number;
  lastClientY: number;
  pendingCellKey: string | null;
  panning: boolean;
  cellMoving: boolean;
  cellResizing: boolean;
  longPressTimer: ReturnType<typeof setTimeout> | null;
  cellMove: CellMoveSession | null;
  cellResize: CellResizeSession | null;
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

  useLayoutEffect(() => {
    modelRef.current = model;
  }, [model]);

  const worldW = model.stageW;
  const worldH = model.stageH;

  const [viewport, setViewport] = useState({ w: 360, h: 280 });
  const [transform, setTransform] = useState({ scale: 1, x: 16, y: 16 });
  const [cellMovePreview, setCellMovePreview] = useState<CellMovePreview | null>(null);
  const [cellResizePreview, setCellResizePreview] = useState<ResizePreview | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const transformRef = useRef(transform);
  const lastPointerModsRef = useRef({ ctrlKey: false, metaKey: false, shiftKey: false });

  useLayoutEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  const anchors = useMemo(
    () => Array.from(model.cells.values()).filter((c) => !c.mergedInto),
    [model.cells],
  );
  const selectedKeySet = useMemo(() => new Set(model.selectedKeys), [model.selectedKeys]);
  const resizeSpec = useMemo(() => {
    if (!model.hasGrid || cellMovePreview || cellResizePreview) return null;
    return resolveResizeSpec(model.selectedKeys, model.cells);
  }, [model.hasGrid, model.selectedKeys, model.cells, cellMovePreview, cellResizePreview]);
  const borderSegs = useMemo(
    () =>
      computeSharedEdgeBorderSegments(anchors, model.gridStyle, model.groupStyles, {
        renderDefaultBorders: true,
      }),
    [anchors, model.gridStyle, model.groupStyles],
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
    if (!model.hasGrid) return;

    let disposed = false;
    let detach: (() => void) | undefined;

    const attach = () => {
      const stage = stageRef.current;
      const container = stage?.container();
      if (!container || disposed) return false;

      const clearLongPressTimer = (d: DragSession) => {
        if (d.longPressTimer) {
          clearTimeout(d.longPressTimer);
          d.longPressTimer = null;
        }
      };

      const beginCellMove = (d: DragSession) => {
        if (!d.pendingCellKey) return;
        const m = modelRef.current;
        const moveKeys = resolveMoveKeys(d.pendingCellKey, m.selectedKeys, m.cells, m.cols, m.rows);
        if (!moveKeys) return;
        const originBounds = selectionBoundsFromKeys(moveKeys, m.cells);
        if (!originBounds) return;

        const cw = m.gridStyle.cellWidth;
        const ch = m.gridStyle.cellHeight;
        const grid = clientToGridCell(
          d.lastClientX,
          d.lastClientY,
          container,
          transformRef.current,
          cw,
          ch,
          m.cols,
          m.rows,
        );
        if (!grid) return;

        const boundsLeft = PAD + originBounds.c0 * cw;
        const boundsTop = PAD + originBounds.r0 * ch;
        const world = clientToWorld(d.lastClientX, d.lastClientY, container, transformRef.current);
        const ghostWidth = (originBounds.c1 - originBounds.c0 + 1) * cw;
        const ghostHeight = (originBounds.r1 - originBounds.r0 + 1) * ch;

        d.cellMoving = true;
        d.panning = false;
        d.cellMove = {
          moveKeys,
          originBounds,
          grabRow: grid.row,
          grabCol: grid.col,
          grabOffsetX: world.x - boundsLeft,
          grabOffsetY: world.y - boundsTop,
          ghostWidth,
          ghostHeight,
        };
        container.style.cursor = "grabbing";

        const preview = buildCellMovePreview(
          d.cellMove,
          d.lastClientX,
          d.lastClientY,
          container,
          transformRef.current,
          cw,
          ch,
          m.cols,
          m.rows,
        );
        if (preview) setCellMovePreview(preview);
      };

      const onPointerDown = (e: PointerEvent) => {
        if (e.button !== 0) return;
        const st = stageRef.current;
        if (!st) return;
        lastPointerModsRef.current = {
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          shiftKey: e.shiftKey,
        };
        st.setPointersPositions(e);
        const pos = st.getPointerPosition();
        if (!pos) return;
        const hit = st.getIntersection(pos);
        const nm = typeof hit?.name === "function" ? hit.name() : "";
        const resizeHandle = parseResizeHandle(nm);
        let pendingCellKey: string | null = null;
        if (nm.startsWith("cell-")) pendingCellKey = nm.slice("cell-".length);

        const mods = lastPointerModsRef.current;
        const canLongPressMove =
          pendingCellKey &&
          !resizeHandle &&
          !mods.ctrlKey &&
          !mods.metaKey &&
          !mods.shiftKey &&
          modelRef.current.hasGrid;

        const session: DragSession = {
          pointerId: e.pointerId,
          startClientX: e.clientX,
          startClientY: e.clientY,
          lastClientX: e.clientX,
          lastClientY: e.clientY,
          pendingCellKey,
          panning: false,
          cellMoving: false,
          cellResizing: false,
          longPressTimer: null,
          cellMove: null,
          cellResize: null,
        };

        if (resizeHandle) {
          const m = modelRef.current;
          const spec = resolveResizeSpec(m.selectedKeys, m.cells);
          if (spec) {
            session.cellResizing = true;
            session.cellResize = {
              spec,
              handle: resizeHandle,
              resizeKeys: [...m.selectedKeys],
            };
            container.style.cursor = resizeCursor(resizeHandle);
            const cw = m.gridStyle.cellWidth;
            const ch = m.gridStyle.cellHeight;
            const grid = clientToGridCell(
              e.clientX,
              e.clientY,
              container,
              transformRef.current,
              cw,
              ch,
              m.cols,
              m.rows,
            );
            if (grid) {
              setCellResizePreview(
                buildResizePreview(spec, grid.row, grid.col, resizeHandle, m.cells, m.cols, m.rows),
              );
            }
          }
        } else if (canLongPressMove) {
          session.longPressTimer = setTimeout(() => {
            const d = dragRef.current;
            if (!d || d.pointerId !== e.pointerId || d.cellMoving || d.cellResizing) return;
            beginCellMove(d);
          }, LONG_PRESS_MS);
        }

        dragRef.current = session;
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

        if (d.cellResizing && d.cellResize) {
          d.lastClientX = e.clientX;
          d.lastClientY = e.clientY;
          const m = modelRef.current;
          const cw = m.gridStyle.cellWidth;
          const ch = m.gridStyle.cellHeight;
          const grid = clientToGridCell(
            e.clientX,
            e.clientY,
            container,
            transformRef.current,
            cw,
            ch,
            m.cols,
            m.rows,
          );
          if (!grid) return;
          setCellResizePreview(
            buildResizePreview(
              d.cellResize.spec,
              grid.row,
              grid.col,
              d.cellResize.handle,
              m.cells,
              m.cols,
              m.rows,
            ),
          );
          return;
        }

        if (d.cellMoving && d.cellMove) {
          d.lastClientX = e.clientX;
          d.lastClientY = e.clientY;
          const m = modelRef.current;
          const cw = m.gridStyle.cellWidth;
          const ch = m.gridStyle.cellHeight;
          const preview = buildCellMovePreview(
            d.cellMove,
            e.clientX,
            e.clientY,
            container,
            transformRef.current,
            cw,
            ch,
            m.cols,
            m.rows,
          );
          if (preview) setCellMovePreview(preview);
          return;
        }

        if (d.longPressTimer && dist > LONG_PRESS_MOVE_CANCEL_PX) {
          clearLongPressTimer(d);
        }

        // 셀 위에서는 팬하지 않음 — 길게 눌러 집기 vs 클릭 선택만
        if (!d.longPressTimer && !d.pendingCellKey && !d.cellResizing && dist > PAN_DRAG_THRESHOLD_PX) {
          d.panning = true;
        }
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
        clearLongPressTimer(d);
        try {
          container.releasePointerCapture(e.pointerId);
        } catch {
          /* */
        }

        if (d.cellResizing && d.cellResize) {
          const m = modelRef.current;
          const cw = m.gridStyle.cellWidth;
          const ch = m.gridStyle.cellHeight;
          const grid = clientToGridCell(
            e.clientX,
            e.clientY,
            container,
            transformRef.current,
            cw,
            ch,
            m.cols,
            m.rows,
          );
          if (grid) {
            m.resizeSelectedCell(grid.row, grid.col, d.cellResize.handle, d.cellResize.resizeKeys);
          }
          container.style.cursor = "";
          setCellResizePreview(null);
          dragRef.current = null;
          return;
        }

        if (d.cellMoving && d.cellMove) {
          const m = modelRef.current;
          const cw = m.gridStyle.cellWidth;
          const ch = m.gridStyle.cellHeight;
          const preview = buildCellMovePreview(
            d.cellMove,
            e.clientX,
            e.clientY,
            container,
            transformRef.current,
            cw,
            ch,
            m.cols,
            m.rows,
          );
          let moved = false;
          if (
            preview &&
            preview.valid &&
            (preview.deltaRow !== 0 || preview.deltaCol !== 0)
          ) {
            moved = m.moveSelectionByDelta(preview.deltaRow, preview.deltaCol, d.cellMove.moveKeys);
          }
          if (!moved && d.pendingCellKey) {
            m.selectCell(d.pendingCellKey, m.cells);
          }
          container.style.cursor = "";
          setCellMovePreview(null);
          dragRef.current = null;
          return;
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
      container.addEventListener("pointermove", onPointerMove);
      container.addEventListener("pointerup", endPointer);
      container.addEventListener("pointercancel", endPointer);
      detach = () => {
        container.removeEventListener("pointerdown", onPointerDown);
        container.removeEventListener("pointermove", onPointerMove);
        container.removeEventListener("pointerup", endPointer);
        container.removeEventListener("pointercancel", endPointer);
      };
      return true;
    };

    if (!attach()) {
      const timer = window.setTimeout(() => {
        if (!disposed) attach();
      }, 0);
      return () => {
        disposed = true;
        window.clearTimeout(timer);
        detach?.();
      };
    }

    return () => {
      disposed = true;
      detach?.();
    };
  }, [viewport.w, viewport.h, worldW, worldH, model.hasGrid]);

  const worldGroup = (children: React.ReactNode) => (
    <Group x={transform.x} y={transform.y} scaleX={transform.scale} scaleY={transform.scale}>
      {children}
    </Group>
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-zinc-100 dark:bg-zinc-950">
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

      <KonvaGridPersistControls model={model} />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <KonvaEditorSidePanel model={model} />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-zinc-200/90 p-2 dark:bg-zinc-900/80">
          {!model.hasGrid && (
            <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-white/60 p-6 text-center dark:border-zinc-700 dark:bg-zinc-950/40">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">그리드를 생성하세요</p>
              <p className="max-w-xs text-[11px] leading-relaxed text-zinc-500">
                왼쪽 <strong>그리드</strong> 탭에서 열·행·셀 크기를 입력한 뒤 생성하세요.
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
                        <KonvaGridCellFills
                          {...gridBodyProps}
                          dragSourceKeys={cellMovePreview?.sourceKeys ?? null}
                        />
                      </>,
                    )}
                  </Layer>
                  <Layer listening={false}>
                    {worldGroup(<KonvaGridSelectionLayer {...gridBodyProps} />)}
                  </Layer>
                  {resizeSpec && (
                    <Layer listening>
                      {worldGroup(
                        <KonvaGridResizeHandles bounds={resizeSpec} gridStyle={model.gridStyle} />,
                      )}
                    </Layer>
                  )}
                  {cellResizePreview && (
                    <Layer listening={false}>
                      {worldGroup(
                        <Rect
                          x={PAD + cellResizePreview.targetBounds.c0 * model.gridStyle.cellWidth}
                          y={PAD + cellResizePreview.targetBounds.r0 * model.gridStyle.cellHeight}
                          width={
                            (cellResizePreview.targetBounds.c1 - cellResizePreview.targetBounds.c0 + 1) *
                            model.gridStyle.cellWidth
                          }
                          height={
                            (cellResizePreview.targetBounds.r1 - cellResizePreview.targetBounds.r0 + 1) *
                            model.gridStyle.cellHeight
                          }
                          fill={cellResizePreview.valid ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.14)"}
                          stroke={cellResizePreview.valid ? "#22c55e" : "#ef4444"}
                          strokeWidth={2}
                          dash={[6, 4]}
                        />,
                      )}
                    </Layer>
                  )}
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
                  {cellMovePreview && (
                    <Layer listening={false}>
                      {worldGroup(
                        <>
                          <Rect
                            x={PAD + cellMovePreview.originBounds.c0 * model.gridStyle.cellWidth}
                            y={PAD + cellMovePreview.originBounds.r0 * model.gridStyle.cellHeight}
                            width={
                              (cellMovePreview.originBounds.c1 - cellMovePreview.originBounds.c0 + 1) *
                              model.gridStyle.cellWidth
                            }
                            height={
                              (cellMovePreview.originBounds.r1 - cellMovePreview.originBounds.r0 + 1) *
                              model.gridStyle.cellHeight
                            }
                            fill="rgba(255,255,255,0.55)"
                            stroke="#d4d4d8"
                            strokeWidth={1}
                            dash={[4, 4]}
                          />
                          <Rect
                            x={PAD + cellMovePreview.dropCol * model.gridStyle.cellWidth}
                            y={PAD + cellMovePreview.dropRow * model.gridStyle.cellHeight}
                            width={
                              (cellMovePreview.originBounds.c1 - cellMovePreview.originBounds.c0 + 1) *
                              model.gridStyle.cellWidth
                            }
                            height={
                              (cellMovePreview.originBounds.r1 - cellMovePreview.originBounds.r0 + 1) *
                              model.gridStyle.cellHeight
                            }
                            fill={cellMovePreview.valid ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.12)"}
                            stroke={cellMovePreview.valid ? "#22c55e" : "#ef4444"}
                            strokeWidth={2}
                          />
                          <Rect
                            x={cellMovePreview.ghostWorldX}
                            y={cellMovePreview.ghostWorldY}
                            width={cellMovePreview.ghostWidth}
                            height={cellMovePreview.ghostHeight}
                            fill="rgba(59,130,246,0.35)"
                            stroke="#2563eb"
                            strokeWidth={2}
                            shadowColor="rgba(0,0,0,0.25)"
                            shadowBlur={8}
                            shadowOffset={{ x: 2, y: 3 }}
                            shadowOpacity={0.6}
                          />
                        </>,
                      )}
                    </Layer>
                  )}
                </Stage>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
