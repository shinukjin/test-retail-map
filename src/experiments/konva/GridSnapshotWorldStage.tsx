"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import type { TextAlignH, TextAlignV } from "./grid-editor-types";
import { editorCellKey } from "./grid-editor-types";
import { computeSharedEdgeBorderSegments } from "./grid-cell-edge-borders";
import {
  borderForCell,
  cellInnerTextBox,
  cellShowsXDecoration,
  clamp,
  fillForCell,
  GRID_TEXT_LINE_HEIGHT,
  groupStyleForCell,
  konvaTextBoxForVerticalAlign,
  PAD,
  SELECTION_OVERLAY_FILL,
  snapshotDisplayLabel,
  textColorForCell,
} from "./grid-editor-cell-draw";
import type { EditorGridSnapshot } from "./grid-snapshot";

const ZOOM_MIN = 0.12;
const ZOOM_MAX = 6;
const WHEEL_DELTA_CAP = 80;
/** 이 픽셀 이상 움직이면 팬, 그 미만이면 클릭으로 간주 */
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

type Props = {
  snapshot: EditorGridSnapshot;
  worldW: number;
  worldH: number;
  cw: number;
  ch: number;
  selectedKey: string | null;
  onPickCell: (key: string) => void;
  onClearSelection: () => void;
};

export function GridSnapshotWorldStage({
  snapshot,
  worldW,
  worldH,
  cw,
  ch,
  selectedKey,
  onPickCell,
  onClearSelection,
}: Props) {
  const [viewport, setViewport] = useState({ w: 360, h: 280 });
  const [transform, setTransform] = useState({ scale: 1, x: 16, y: 16 });
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const onPickCellRef = useRef(onPickCell);
  const onClearSelectionRef = useRef(onClearSelection);

  useEffect(() => {
    onPickCellRef.current = onPickCell;
    onClearSelectionRef.current = onClearSelection;
  }, [onPickCell, onClearSelection]);

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

  const anchors = useMemo(
    () => snapshot.cells.filter((c) => !c.mergedInto),
    [snapshot.cells],
  );
  const borderSegs = useMemo(
    () => computeSharedEdgeBorderSegments(anchors, snapshot.gridStyle, snapshot.groupStyles),
    [anchors, snapshot.gridStyle, snapshot.groupStyles],
  );

  /** 왼쪽 버튼: 끌면 팬, 짧게 누르면 칸 선택 */
  useEffect(() => {
    const stage = stageRef.current;
    const container = stage?.container();
    if (!container) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const st = stageRef.current;
      if (!st) return;
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
        /* already captured */
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
      if (!d.panning) {
        if (d.pendingCellKey) onPickCellRef.current(d.pendingCellKey);
        else onClearSelectionRef.current();
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
  }, [viewport.w, viewport.h, worldW, worldH, snapshot]);

  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="mb-1.5 flex shrink-0 flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={applyFit}
          className="rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
        >
          화면에 맞춤
        </button>
        <button
          type="button"
          onClick={() => zoomBy(-0.12)}
          className="rounded border border-zinc-300 px-2 py-0.5 text-[10px] dark:border-zinc-600"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => zoomBy(0.12)}
          className="rounded border border-zinc-300 px-2 py-0.5 text-[10px] dark:border-zinc-600"
        >
          +
        </button>
        <span className="text-[10px] tabular-nums text-zinc-500">
          {(transform.scale * 100).toFixed(0)}%
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/80">
      <div ref={viewportRef} className="relative min-h-[200px] w-full flex-1 overflow-hidden">
        <Stage
          ref={stageRef}
          width={viewport.w}
          height={viewport.h}
          onWheel={handleWheel}
        >
          <Layer>
            <Group
              x={transform.x}
              y={transform.y}
              scaleX={transform.scale}
              scaleY={transform.scale}
            >
              <Rect
                name="grid-backdrop"
                x={0}
                y={0}
                width={worldW}
                height={worldH}
                fill="rgba(244,244,245,0.45)"
                stroke="#d4d4d8"
                strokeWidth={1}
              />
              {anchors.map((c) => {
                const key = editorCellKey(c.row, c.col);
                const x = PAD + c.col * cw;
                const y = PAD + c.row * ch;
                const w = cw * c.colspan;
                const h = ch * c.rowspan;
                const g = snapshot.gridStyle;
                const grp = groupStyleForCell(c, snapshot.groupStyles);
                const fill = fillForCell(c, g, grp);
                const sel = selectedKey === key;
                return (
                  <Group key={key}>
                    <Rect
                      name={`cell-${key}`}
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      fill={fill}
                    />
                    {sel && (
                      <Rect
                        x={x}
                        y={y}
                        width={w}
                        height={h}
                        fill={SELECTION_OVERLAY_FILL}
                        listening={false}
                      />
                    )}
                  </Group>
                );
              })}
              {borderSegs.horizontal.map((s, i) => (
                <Line
                  key={`h-${i}-${s.y}-${s.x0}-${(s.dash ?? []).join(",")}}`}
                  points={[s.x0, s.y, s.x1, s.y]}
                  stroke={s.stroke}
                  strokeWidth={s.strokeWidth}
                  dash={s.dash}
                  perfectDrawEnabled={!s.dash}
                  lineCap={s.dash ? "round" : undefined}
                  listening={false}
                />
              ))}
              {borderSegs.vertical.map((s, i) => (
                <Line
                  key={`v-${i}-${s.x}-${s.y0}-${(s.dash ?? []).join(",")}}`}
                  points={[s.x, s.y0, s.x, s.y1]}
                  stroke={s.stroke}
                  strokeWidth={s.strokeWidth}
                  dash={s.dash}
                  perfectDrawEnabled={!s.dash}
                  lineCap={s.dash ? "round" : undefined}
                  listening={false}
                />
              ))}
              {anchors.map((c) => {
                if (!cellShowsXDecoration(c, groupStyleForCell(c, snapshot.groupStyles))) return null;
                const key = editorCellKey(c.row, c.col);
                const x = PAD + c.col * cw;
                const y = PAD + c.row * ch;
                const w = cw * c.colspan;
                const h = ch * c.rowspan;
                const inset = 3;
                const x0 = x + inset;
                const y0 = y + inset;
                const x1 = x + w - inset;
                const y1 = y + h - inset;
                if (x1 <= x0 || y1 <= y0) return null;
                const g = snapshot.gridStyle;
                const grp = groupStyleForCell(c, snapshot.groupStyles);
                const br = borderForCell(c, g, grp);
                const stroke =
                  br.width > 0 && br.color !== "transparent" ? br.color : "rgba(100,116,139,0.55)";
                return (
                  <Group key={`x-${key}`} listening={false}>
                    <Line
                      points={[x0, y0, x1, y1]}
                      stroke={stroke}
                      strokeWidth={1}
                      opacity={0.55}
                      listening={false}
                    />
                    <Line
                      points={[x1, y0, x0, y1]}
                      stroke={stroke}
                      strokeWidth={1}
                      opacity={0.55}
                      listening={false}
                    />
                  </Group>
                );
              })}
              {anchors.map((c) => {
                const key = editorCellKey(c.row, c.col);
                const x = PAD + c.col * cw;
                const y = PAD + c.row * ch;
                const w = cw * c.colspan;
                const h = ch * c.rowspan;
                const g = snapshot.gridStyle;
                const grp = groupStyleForCell(c, snapshot.groupStyles);
                const label = snapshotDisplayLabel(c);
                const fs = clamp(c.fontSize ?? grp?.fontSize ?? g.fontSize, 0, 48);
                const fc = textColorForCell(c, g, grp);
                const alignH: TextAlignH = c.alignH ?? grp?.alignH ?? "center";
                const alignV: TextAlignV = c.alignV ?? grp?.alignV ?? "middle";
                const inner = cellInnerTextBox(x, y, w, h);
                const textBox =
                  fs > 0 && label.trim()
                    ? konvaTextBoxForVerticalAlign(alignV, inner, label, fs, GRID_TEXT_LINE_HEIGHT)
                    : inner;
                if (fs <= 0 || !label.trim()) return null;
                return (
                  <Group
                    key={`t-${key}`}
                    x={inner.x}
                    y={inner.y}
                    listening={false}
                    clipFunc={(ctx) => {
                      ctx.beginPath();
                      ctx.rect(0, 0, inner.w, inner.h);
                      ctx.clip();
                    }}
                  >
                    <Text
                      x={0}
                      y={textBox.y - inner.y}
                      width={inner.w}
                      height={textBox.h}
                      text={label}
                      fontSize={fs}
                      fill={fc}
                      align={alignH}
                      verticalAlign="top"
                      lineHeight={GRID_TEXT_LINE_HEIGHT}
                      wrap="word"
                      padding={0}
                      listening={false}
                    />
                  </Group>
                );
              })}
            </Group>
          </Layer>
        </Stage>
      </div>
      </div>
    </div>
  );
}
