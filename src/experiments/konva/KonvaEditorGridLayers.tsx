"use client";

import { memo, useMemo } from "react";
import { Group, Line, Rect, Text } from "react-konva";
import type { EditorGridCell, EditorGridStyle, EditorGroupStyle, TextAlignH, TextAlignV } from "./grid-editor-types";
import { editorCellKey } from "./grid-editor-types";
import type { HBorderSeg, VBorderSeg } from "./grid-cell-edge-borders";
import {
  borderForCell,
  cellInnerTextBox,
  cellShowsXDecoration,
  clamp,
  displayLabel,
  editorRectFillForCell,
  GRID_TEXT_LINE_HEIGHT,
  groupStyleForCell,
  konvaTextBoxForVerticalAlign,
  PAD,
  SELECTION_OVERLAY_FILL,
  textColorForCell,
} from "./grid-editor-cell-draw";

type CellGeom = { x: number; y: number; w: number; h: number };

function cellGeom(cell: EditorGridCell, cw: number, ch: number): CellGeom {
  return {
    x: PAD + cell.col * cw,
    y: PAD + cell.row * ch,
    w: cw * cell.colspan,
    h: ch * cell.rowspan,
  };
}

type FillProps = {
  cell: EditorGridCell;
  cw: number;
  ch: number;
  gridStyle: EditorGridStyle;
  groupStyles: Record<string, EditorGroupStyle>;
  hideCellInteriorText: boolean;
  isDragSource?: boolean;
};

const KonvaCellFill = memo(
  function KonvaCellFill({ cell, cw, ch, gridStyle, groupStyles, hideCellInteriorText, isDragSource }: FillProps) {
    const key = editorCellKey(cell.row, cell.col);
    const { x, y, w, h } = cellGeom(cell, cw, ch);
    const grp = groupStyleForCell(cell, groupStyles);
    const fill = editorRectFillForCell(cell, gridStyle, grp, hideCellInteriorText);
    return (
      <Rect
        name={`cell-${key}`}
        x={x}
        y={y}
        width={w}
        height={h}
        fill={fill}
        opacity={isDragSource ? 0.25 : 1}
      />
    );
  },
  (a, b) =>
    a.cell === b.cell &&
    a.cw === b.cw &&
    a.ch === b.ch &&
    a.gridStyle === b.gridStyle &&
    a.groupStyles === b.groupStyles &&
    a.hideCellInteriorText === b.hideCellInteriorText &&
    a.isDragSource === b.isDragSource,
);

type SelectionProps = {
  cell: EditorGridCell;
  cw: number;
  ch: number;
};

const KonvaCellSelection = memo(
  function KonvaCellSelection({ cell, cw, ch }: SelectionProps) {
    const { x, y, w, h } = cellGeom(cell, cw, ch);
    return (
      <Rect x={x} y={y} width={w} height={h} fill={SELECTION_OVERLAY_FILL} listening={false} />
    );
  },
  (a, b) => a.cell === b.cell && a.cw === b.cw && a.ch === b.ch,
);

type TextProps = FillProps;

const KonvaCellLabel = memo(
  function KonvaCellLabel({ cell, cw, ch, gridStyle, groupStyles, hideCellInteriorText }: TextProps) {
    const key = editorCellKey(cell.row, cell.col);
    const { x, y, w, h } = cellGeom(cell, cw, ch);
    const label = displayLabel(cell, "editor", { hideCellInteriorText });
    const grp = groupStyleForCell(cell, groupStyles);
    const fs = clamp(cell.fontSize ?? grp?.fontSize ?? gridStyle.fontSize, 0, 48);
    const fc = textColorForCell(cell, gridStyle, grp);
    const alignH: TextAlignH = cell.alignH ?? grp?.alignH ?? "center";
    const alignV: TextAlignV = cell.alignV ?? grp?.alignV ?? "middle";
    const inner = cellInnerTextBox(x, y, w, h);
    const textBox =
      fs > 0 ? konvaTextBoxForVerticalAlign(alignV, inner, label, fs, GRID_TEXT_LINE_HEIGHT) : inner;
    if (fs <= 0 || !label.trim()) return null;
    return (
      <Group
        key={`t-${key}`}
        x={inner.x}
        y={inner.y}
        clipFunc={(ctx) => {
          ctx.beginPath();
          ctx.rect(0, 0, inner.w, inner.h);
          ctx.clip();
        }}
        listening={false}
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
  },
  (a, b) =>
    a.cell === b.cell &&
    a.cw === b.cw &&
    a.ch === b.ch &&
    a.gridStyle === b.gridStyle &&
    a.groupStyles === b.groupStyles &&
    a.hideCellInteriorText === b.hideCellInteriorText,
);

type XProps = FillProps;

const KonvaCellXDecoration = memo(
  function KonvaCellXDecoration({ cell, cw, ch, gridStyle, groupStyles }: XProps) {
    if (!cellShowsXDecoration(cell, groupStyleForCell(cell, groupStyles))) return null;
    const key = editorCellKey(cell.row, cell.col);
    const { x, y, w, h } = cellGeom(cell, cw, ch);
    const inset = 3;
    const x0 = x + inset;
    const y0 = y + inset;
    const x1 = x + w - inset;
    const y1 = y + h - inset;
    if (x1 <= x0 || y1 <= y0) return null;
    const br = borderForCell(cell, gridStyle, groupStyleForCell(cell, groupStyles));
    const stroke = br.width > 0 && br.color !== "transparent" ? br.color : "rgba(100,116,139,0.55)";
    return (
      <Group key={`x-${key}`} listening={false}>
        <Line points={[x0, y0, x1, y1]} stroke={stroke} strokeWidth={1} opacity={0.55} listening={false} />
        <Line points={[x1, y0, x0, y1]} stroke={stroke} strokeWidth={1} opacity={0.55} listening={false} />
      </Group>
    );
  },
  (a, b) =>
    a.cell === b.cell &&
    a.cw === b.cw &&
    a.ch === b.ch &&
    a.gridStyle === b.gridStyle &&
    a.groupStyles === b.groupStyles,
);

type BorderLayerProps = {
  horizontal: HBorderSeg[];
  vertical: VBorderSeg[];
};

export const KonvaGridBorderLayer = memo(function KonvaGridBorderLayer({
  horizontal,
  vertical,
}: BorderLayerProps) {
  return (
    <>
      {horizontal.map((s, i) => (
        <Line
          key={`h-${i}-${s.y}-${s.x0}-${(s.dash ?? []).join(",")}`}
          points={[s.x0, s.y, s.x1, s.y]}
          stroke={s.stroke}
          strokeWidth={s.strokeWidth}
          dash={s.dash}
          perfectDrawEnabled={!s.dash}
          lineCap={s.dash ? "round" : undefined}
          listening={false}
        />
      ))}
      {vertical.map((s, i) => (
        <Line
          key={`v-${i}-${s.x}-${s.y0}-${(s.dash ?? []).join(",")}`}
          points={[s.x, s.y0, s.x, s.y1]}
          stroke={s.stroke}
          strokeWidth={s.strokeWidth}
          dash={s.dash}
          perfectDrawEnabled={!s.dash}
          lineCap={s.dash ? "round" : undefined}
          listening={false}
        />
      ))}
    </>
  );
});

type HeadersProps = {
  cols: number;
  rows: number;
  cw: number;
  ch: number;
  show: boolean;
};

export const KonvaGridHeaders = memo(function KonvaGridHeaders({ cols, rows, cw, ch, show }: HeadersProps) {
  if (!show) return null;
  return (
    <>
      {Array.from({ length: cols }, (_, col) => (
        <Text
          key={`hc-${col}`}
          x={PAD + col * cw}
          y={2}
          width={cw}
          text={String(col + 1)}
          fontSize={9}
          fill="#71717a"
          align="center"
          listening={false}
        />
      ))}
      {Array.from({ length: rows }, (_, row) => (
        <Text
          key={`hr-${row}`}
          x={2}
          y={PAD + row * ch}
          height={ch}
          text={String(row + 1)}
          fontSize={9}
          fill="#71717a"
          align="center"
          verticalAlign="middle"
          width={PAD - 4}
          listening={false}
        />
      ))}
    </>
  );
});

type GridBodyProps = {
  anchors: EditorGridCell[];
  selectedKeySet: ReadonlySet<string>;
  gridStyle: EditorGridStyle;
  groupStyles: Record<string, EditorGroupStyle>;
  hideCellInteriorText: boolean;
};

export const KonvaGridCellFills = memo(
  function KonvaGridCellFills({
    anchors,
    gridStyle,
    groupStyles,
    hideCellInteriorText,
    dragSourceKeys,
  }: Pick<GridBodyProps, "anchors" | "gridStyle" | "groupStyles" | "hideCellInteriorText"> & {
    dragSourceKeys?: Set<string> | null;
  }) {
    const cw = gridStyle.cellWidth;
    const ch = gridStyle.cellHeight;
    return (
      <>
        {anchors.map((cell) => {
          const key = editorCellKey(cell.row, cell.col);
          return (
            <KonvaCellFill
              key={key}
              cell={cell}
              cw={cw}
              ch={ch}
              gridStyle={gridStyle}
              groupStyles={groupStyles}
              hideCellInteriorText={hideCellInteriorText}
              isDragSource={dragSourceKeys?.has(key) ?? false}
            />
          );
        })}
      </>
    );
  },
  (a, b) =>
    a.anchors === b.anchors &&
    a.gridStyle === b.gridStyle &&
    a.groupStyles === b.groupStyles &&
    a.hideCellInteriorText === b.hideCellInteriorText &&
    a.dragSourceKeys === b.dragSourceKeys,
);

const HANDLE_SIZE = 10;

type ResizeBounds = { r0: number; r1: number; c0: number; c1: number };

function boundsGeom(bounds: ResizeBounds, cw: number, ch: number) {
  return {
    x: PAD + bounds.c0 * cw,
    y: PAD + bounds.r0 * ch,
    w: (bounds.c1 - bounds.c0 + 1) * cw,
    h: (bounds.r1 - bounds.r0 + 1) * ch,
  };
}

function ResizeHandleDot({
  name,
  cx,
  cy,
}: {
  name: string;
  cx: number;
  cy: number;
}) {
  const half = HANDLE_SIZE / 2;
  return (
    <Rect
      name={name}
      x={cx - half}
      y={cy - half}
      width={HANDLE_SIZE}
      height={HANDLE_SIZE}
      fill="#2563eb"
      stroke="#ffffff"
      strokeWidth={1.5}
      cornerRadius={2}
    />
  );
}

export const KonvaGridResizeHandles = memo(
  function KonvaGridResizeHandles({
    bounds,
    gridStyle,
  }: {
    bounds: ResizeBounds;
    gridStyle: EditorGridStyle;
  }) {
    const cw = gridStyle.cellWidth;
    const ch = gridStyle.cellHeight;
    const { x, y, w, h } = boundsGeom(bounds, cw, ch);
    return (
      <>
        <ResizeHandleDot name="resize-se" cx={x + w} cy={y + h} />
        <ResizeHandleDot name="resize-e" cx={x + w} cy={y + h / 2} />
        <ResizeHandleDot name="resize-s" cx={x + w / 2} cy={y + h} />
      </>
    );
  },
  (a, b) => a.bounds === b.bounds && a.gridStyle === b.gridStyle,
);

export const KonvaGridSelectionLayer = memo(
  function KonvaGridSelectionLayer({
    anchors,
    selectedKeySet,
    gridStyle,
  }: Pick<GridBodyProps, "anchors" | "selectedKeySet" | "gridStyle">) {
    const cw = gridStyle.cellWidth;
    const ch = gridStyle.cellHeight;
    const selected = useMemo(
      () => anchors.filter((c) => selectedKeySet.has(editorCellKey(c.row, c.col))),
      [anchors, selectedKeySet],
    );
    return (
      <>
        {selected.map((cell) => (
          <KonvaCellSelection
            key={`sel-${editorCellKey(cell.row, cell.col)}`}
            cell={cell}
            cw={cw}
            ch={ch}
          />
        ))}
      </>
    );
  },
  (a, b) =>
    a.anchors === b.anchors &&
    a.selectedKeySet === b.selectedKeySet &&
    a.gridStyle === b.gridStyle,
);

export const KonvaGridTextLayer = memo(
  function KonvaGridTextLayer(props: GridBodyProps) {
    const cw = props.gridStyle.cellWidth;
    const ch = props.gridStyle.cellHeight;
    return (
      <>
        {props.anchors.map((cell) => (
          <KonvaCellLabel
            key={`lbl-${editorCellKey(cell.row, cell.col)}`}
            cell={cell}
            cw={cw}
            ch={ch}
            gridStyle={props.gridStyle}
            groupStyles={props.groupStyles}
            hideCellInteriorText={props.hideCellInteriorText}
          />
        ))}
      </>
    );
  },
  (a, b) =>
    a.anchors === b.anchors &&
    a.gridStyle === b.gridStyle &&
    a.groupStyles === b.groupStyles &&
    a.hideCellInteriorText === b.hideCellInteriorText,
);

export const KonvaGridXLayer = memo(
  function KonvaGridXLayer(props: Omit<GridBodyProps, "selectedKeySet">) {
    const cw = props.gridStyle.cellWidth;
    const ch = props.gridStyle.cellHeight;
    return (
      <>
        {props.anchors.map((cell) => (
          <KonvaCellXDecoration
            key={`x-${editorCellKey(cell.row, cell.col)}`}
            cell={cell}
            cw={cw}
            ch={ch}
            gridStyle={props.gridStyle}
            groupStyles={props.groupStyles}
            hideCellInteriorText={props.hideCellInteriorText}
          />
        ))}
      </>
    );
  },
  (a, b) =>
    a.anchors === b.anchors &&
    a.gridStyle === b.gridStyle &&
    a.groupStyles === b.groupStyles &&
    a.hideCellInteriorText === b.hideCellInteriorText,
);
