import { FabricText, Line, Rect, type Canvas } from "fabric";
import type { EditorGridCell, EditorGridStyle, EditorGroupStyle, TextAlignH, TextAlignV } from "@/experiments/konva/grid-editor-types";
import { editorCellKey } from "@/experiments/konva/grid-editor-types";
import type { HBorderSeg, VBorderSeg } from "@/experiments/konva/grid-cell-edge-borders";
import { computeSharedEdgeBorderSegments } from "@/experiments/konva/grid-cell-edge-borders";
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
  type GridCellLabelMode,
} from "@/experiments/konva/grid-editor-cell-draw";
import { gridBorderFingerprint } from "@/experiments/grid-editor/grid-border-fingerprint";

export type FabricCellObjects = {
  rect: Rect;
  overlay: Rect | null;
  text: FabricText | null;
  xLines: Line[] | null;
};

export type FabricGridRuntime = {
  canvas: Canvas;
  hitBg: Rect;
  headerTexts: FabricText[];
  cellObjs: Map<string, FabricCellObjects>;
  borderLines: Line[];
  cols: number;
  rows: number;
  stageW: number;
  stageH: number;
  borderFingerprint: string;
};

export type FabricSyncContext = {
  cols: number;
  rows: number;
  stageW: number;
  stageH: number;
  cells: Map<string, EditorGridCell>;
  gridStyle: EditorGridStyle;
  groupStyles: Record<string, EditorGroupStyle>;
  selectedKeys: string[];
  interactive: boolean;
  hideCellInteriorText: boolean;
  showRowColHeaders: boolean;
  labelMode: GridCellLabelMode;
};

type SelectCellFn = (
  key: string | null,
  snapshot?: Map<string, EditorGridCell>,
  opts?: { additive?: boolean; rangeExtend?: boolean },
) => void;

function anchorList(cells: Map<string, EditorGridCell>): EditorGridCell[] {
  return Array.from(cells.values()).filter((c) => !c.mergedInto);
}

function cellBox(c: EditorGridCell, cw: number, ch: number) {
  return {
    x: PAD + c.col * cw,
    y: PAD + c.row * ch,
    w: cw * c.colspan,
    h: ch * c.rowspan,
  };
}

function removeCellObjects(runtime: FabricGridRuntime, key: string) {
  const objs = runtime.cellObjs.get(key);
  if (!objs) return;
  runtime.canvas.remove(objs.rect);
  if (objs.overlay) runtime.canvas.remove(objs.overlay);
  if (objs.text) runtime.canvas.remove(objs.text);
  if (objs.xLines) for (const ln of objs.xLines) runtime.canvas.remove(ln);
  runtime.cellObjs.delete(key);
}

function clearBorderLines(runtime: FabricGridRuntime) {
  for (const ln of runtime.borderLines) runtime.canvas.remove(ln);
  runtime.borderLines = [];
}

function clearHeaderTexts(runtime: FabricGridRuntime) {
  for (const t of runtime.headerTexts) runtime.canvas.remove(t);
  runtime.headerTexts = [];
}

function rebuildHeaders(runtime: FabricGridRuntime, ctx: FabricSyncContext) {
  clearHeaderTexts(runtime);
  if (!ctx.showRowColHeaders) return;
  const cw = ctx.gridStyle.cellWidth;
  const ch = ctx.gridStyle.cellHeight;
  for (let col = 0; col < ctx.cols; col++) {
    const ht = new FabricText(String(col + 1), {
      left: PAD + col * cw + cw / 2,
      top: 2,
      fontSize: 9,
      fill: "#71717a",
      originX: "center",
      selectable: false,
      evented: false,
    });
    runtime.canvas.add(ht);
    runtime.headerTexts.push(ht);
  }
  for (let row = 0; row < ctx.rows; row++) {
    const ht = new FabricText(String(row + 1), {
      left: Math.max(2, PAD / 2),
      top: PAD + row * ch + ch / 2,
      fontSize: 9,
      fill: "#71717a",
      originX: "center",
      originY: "center",
      selectable: false,
      evented: false,
    });
    runtime.canvas.add(ht);
    runtime.headerTexts.push(ht);
  }
}

function rebuildBorders(runtime: FabricGridRuntime, ctx: FabricSyncContext) {
  clearBorderLines(runtime);
  const anchors = anchorList(ctx.cells);
  const segs = computeSharedEdgeBorderSegments(anchors, ctx.gridStyle, ctx.groupStyles, {
    renderDefaultBorders: ctx.interactive,
  });
  const addSeg = (s: HBorderSeg | VBorderSeg, horizontal: boolean) => {
    const ln = horizontal
      ? new Line([(s as HBorderSeg).x0, (s as HBorderSeg).y, (s as HBorderSeg).x1, (s as HBorderSeg).y], {
          stroke: s.stroke,
          strokeWidth: s.strokeWidth,
          strokeDashArray: s.dash ?? null,
          strokeLineCap: s.dash ? "round" : "butt",
          selectable: false,
          evented: false,
          objectCaching: true,
        })
      : new Line([(s as VBorderSeg).x, (s as VBorderSeg).y0, (s as VBorderSeg).x, (s as VBorderSeg).y1], {
          stroke: s.stroke,
          strokeWidth: s.strokeWidth,
          strokeDashArray: s.dash ?? null,
          strokeLineCap: s.dash ? "round" : "butt",
          selectable: false,
          evented: false,
          objectCaching: true,
        });
    runtime.canvas.add(ln);
    runtime.borderLines.push(ln);
  };
  for (const s of segs.horizontal) addSeg(s, true);
  for (const s of segs.vertical) addSeg(s, false);
  runtime.borderFingerprint = gridBorderFingerprint(anchors, ctx.gridStyle, ctx.groupStyles);
}

function syncSelectionOverlay(
  objs: FabricCellObjects,
  runtime: FabricGridRuntime,
  selected: boolean,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (selected) {
    if (!objs.overlay) {
      objs.overlay = new Rect({
        left: x,
        top: y,
        width: w,
        height: h,
        fill: SELECTION_OVERLAY_FILL,
        strokeWidth: 0,
        selectable: false,
        evented: false,
        objectCaching: true,
      });
      runtime.canvas.add(objs.overlay);
    } else {
      objs.overlay.set({ left: x, top: y, width: w, height: h });
      objs.overlay.setCoords();
    }
  } else if (objs.overlay) {
    runtime.canvas.remove(objs.overlay);
    objs.overlay = null;
  }
}

function upsertCellVisual(
  runtime: FabricGridRuntime,
  c: EditorGridCell,
  ctx: FabricSyncContext,
  selectCellRef: { current: SelectCellFn },
  cellsRef: { current: Map<string, EditorGridCell> },
) {
  const key = editorCellKey(c.row, c.col);
  const cw = ctx.gridStyle.cellWidth;
  const ch = ctx.gridStyle.cellHeight;
  const { x, y, w, h } = cellBox(c, cw, ch);
  const grp = groupStyleForCell(c, ctx.groupStyles);
  const fill = editorRectFillForCell(c, ctx.gridStyle, grp, ctx.hideCellInteriorText);
  const selected = ctx.interactive && ctx.selectedKeys.includes(key);

  let objs = runtime.cellObjs.get(key);
  if (!objs) {
    const rect = new Rect({
      left: x,
      top: y,
      width: w,
      height: h,
      fill,
      selectable: false,
      evented: true,
      objectCaching: true,
    });
    rect.on("mousedown", (e) => {
      if (!ctx.interactive) return;
      e.e?.preventDefault?.();
      const dom = e.e as MouseEvent;
      selectCellRef.current(key, new Map(cellsRef.current), {
        additive: dom.ctrlKey || dom.metaKey,
        rangeExtend: dom.shiftKey,
      });
    });
    runtime.canvas.add(rect);
    objs = { rect, overlay: null, text: null, xLines: null };
    runtime.cellObjs.set(key, objs);
  } else {
    objs.rect.set({ left: x, top: y, width: w, height: h, fill });
    objs.rect.setCoords();
  }

  syncSelectionOverlay(objs, runtime, selected, x, y, w, h);

  const label = displayLabel(c, ctx.labelMode, { hideCellInteriorText: ctx.hideCellInteriorText });
  const fs = clamp(c.fontSize ?? grp?.fontSize ?? ctx.gridStyle.fontSize, 0, 48);
  const fc = textColorForCell(c, ctx.gridStyle, grp);
  const alignH: TextAlignH = c.alignH ?? grp?.alignH ?? "center";
  const alignV: TextAlignV = c.alignV ?? grp?.alignV ?? "middle";
  const inner = cellInnerTextBox(x, y, w, h);
  const ta = alignH === "right" ? "right" : alignH === "center" ? "center" : "left";

  if (fs > 0 && label.trim()) {
    const tb = konvaTextBoxForVerticalAlign(alignV, inner, label, fs, GRID_TEXT_LINE_HEIGHT);
    if (!objs.text) {
      const txt = new FabricText(label, {
        left: tb.x,
        top: tb.y,
        width: tb.w,
        height: tb.h,
        fontSize: fs,
        fill: fc,
        textAlign: ta,
        lineHeight: GRID_TEXT_LINE_HEIGHT,
        originX: "left",
        originY: "top",
        fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        selectable: false,
        evented: false,
        objectCaching: true,
        splitByGrapheme: true,
      });
      txt.clipPath = new Rect({
        left: inner.x,
        top: inner.y,
        width: inner.w,
        height: inner.h,
        absolutePositioned: true,
        fill: "transparent",
        strokeWidth: 0,
      });
      txt.initDimensions();
      txt.setCoords();
      runtime.canvas.add(txt);
      objs.text = txt;
    } else {
      objs.text.set({
        text: label,
        left: tb.x,
        top: tb.y,
        width: tb.w,
        height: tb.h,
        fontSize: fs,
        fill: fc,
        textAlign: ta,
      });
      objs.text.initDimensions();
      objs.text.setCoords();
    }
  } else if (objs.text) {
    runtime.canvas.remove(objs.text);
    objs.text = null;
  }

  const showX = cellShowsXDecoration(c, grp);
  if (showX) {
    const inset = 3;
    const x0 = x + inset;
    const y0 = y + inset;
    const x1 = x + w - inset;
    const y1 = y + h - inset;
    if (x1 > x0 && y1 > y0) {
      const br = borderForCell(c, ctx.gridStyle, grp);
      const stroke = br.width > 0 && br.color !== "transparent" ? br.color : "rgba(100,116,139,0.55)";
      if (!objs.xLines) {
        const d1 = new Line([x0, y0, x1, y1], {
          stroke,
          strokeWidth: 1,
          opacity: 0.55,
          selectable: false,
          evented: false,
          objectCaching: true,
        });
        const d2 = new Line([x1, y0, x0, y1], {
          stroke,
          strokeWidth: 1,
          opacity: 0.55,
          selectable: false,
          evented: false,
          objectCaching: true,
        });
        runtime.canvas.add(d1);
        runtime.canvas.add(d2);
        objs.xLines = [d1, d2];
      }
    }
  } else if (objs.xLines) {
    for (const ln of objs.xLines) runtime.canvas.remove(ln);
    objs.xLines = null;
  }
}

export function needsFabricStructuralRebuild(
  runtime: FabricGridRuntime | null,
  ctx: FabricSyncContext,
): boolean {
  if (!runtime) return true;
  return (
    runtime.cols !== ctx.cols ||
    runtime.rows !== ctx.rows ||
    runtime.stageW !== ctx.stageW ||
    runtime.stageH !== ctx.stageH
  );
}

export function syncFabricGridIncremental(
  runtime: FabricGridRuntime,
  ctx: FabricSyncContext,
  prevCells: Map<string, EditorGridCell> | null,
  prevGroupStyles: Record<string, EditorGroupStyle> | null,
  prevSelectedKeys: string[] | null,
  selectCellRef: { current: SelectCellFn },
  cellsRef: { current: Map<string, EditorGridCell> },
) {
  runtime.hitBg.set({ width: ctx.stageW, height: ctx.stageH });
  runtime.hitBg.setCoords();

  const hadHeaders = runtime.headerTexts.length > 0;
  if (runtime.cols !== ctx.cols || runtime.rows !== ctx.rows || hadHeaders !== ctx.showRowColHeaders) {
    rebuildHeaders(runtime, ctx);
  }

  const anchors = anchorList(ctx.cells);
  const anchorKeys = new Set(anchors.map((c) => editorCellKey(c.row, c.col)));
  const selectedSet = new Set(ctx.selectedKeys);
  const prevSelSet = prevSelectedKeys ? new Set(prevSelectedKeys) : null;

  for (const key of [...runtime.cellObjs.keys()]) {
    if (!anchorKeys.has(key)) removeCellObjects(runtime, key);
  }

  const groupStylesChanged = prevGroupStyles !== ctx.groupStyles;

  for (const c of anchors) {
    const key = editorCellKey(c.row, c.col);
    const prev = prevCells?.get(key);
    const selectionChanged = prevSelSet !== null && prevSelSet.has(key) !== selectedSet.has(key);
    const needsVisual =
      prev !== c || groupStylesChanged || !runtime.cellObjs.has(key) || selectionChanged;
    if (needsVisual) {
      upsertCellVisual(runtime, c, ctx, selectCellRef, cellsRef);
    }
  }

  const fp = gridBorderFingerprint(anchors, ctx.gridStyle, ctx.groupStyles);
  if (fp !== runtime.borderFingerprint) {
    rebuildBorders(runtime, ctx);
  }

  runtime.cols = ctx.cols;
  runtime.rows = ctx.rows;
  runtime.stageW = ctx.stageW;
  runtime.stageH = ctx.stageH;

  runtime.canvas.requestRenderAll();
}

export function destroyFabricGridRuntime(runtime: FabricGridRuntime) {
  for (const key of [...runtime.cellObjs.keys()]) removeCellObjects(runtime, key);
  clearBorderLines(runtime);
  clearHeaderTexts(runtime);
  runtime.canvas.remove(runtime.hitBg);
}
