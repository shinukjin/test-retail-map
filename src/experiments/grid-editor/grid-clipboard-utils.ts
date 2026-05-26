import type { EditorGridCell, EditorGridStyle, EditorGroupStyle } from "@/experiments/konva/grid-editor-types";
import { editorCellKey } from "@/experiments/konva/grid-editor-types";
import { groupStyleForCell } from "@/experiments/konva/grid-editor-cell-draw";
import { applyCellMerge } from "@/experiments/konva/grid-merge";
import { rectangularCellKeys, selectionBoundsFromKeys } from "./grid-selection-utils";

export type CellStylePatch = Partial<
  Pick<
    EditorGridCell,
    | "fontSize"
    | "cellFill"
    | "textColor"
    | "showBorder"
    | "borderColor"
    | "borderWidth"
    | "borderStyle"
    | "borderSides"
    | "cellDecoration"
    | "alignH"
    | "alignV"
  >
>;

export type GridStyleClipboard = {
  width: number;
  height: number;
  cells: Array<{ relRow: number; relCol: number; style: CellStylePatch }>;
};

export type GridSelectionClipboard = {
  width: number;
  height: number;
  cells: Array<{
    relRow: number;
    relCol: number;
    cell: Omit<EditorGridCell, "row" | "col">;
  }>;
  groupStyles: Record<string, EditorGroupStyle>;
};

function blankCell(row: number, col: number): EditorGridCell {
  return {
    row,
    col,
    shelfCode: "",
    tier: null,
    cellName: "",
    groupCode: "",
    colspan: 1,
    rowspan: 1,
    mergedInto: null,
  };
}

function cellContent(cell: EditorGridCell): Omit<EditorGridCell, "row" | "col"> {
  return {
    shelfCode: cell.shelfCode,
    tier: cell.tier,
    cellName: cell.cellName,
    groupCode: cell.groupCode,
    colspan: cell.colspan,
    rowspan: cell.rowspan,
    mergedInto: null,
    fontSize: cell.fontSize,
    cellFill: cell.cellFill,
    textColor: cell.textColor,
    showBorder: cell.showBorder,
    borderColor: cell.borderColor,
    borderWidth: cell.borderWidth,
    borderStyle: cell.borderStyle,
    borderSides: cell.borderSides,
    cellDecoration: cell.cellDecoration,
    alignH: cell.alignH,
    alignV: cell.alignV,
  };
}

/** 화면에 보이는 스타일(셀·그룹·전역 병합)을 평탄화해 복사 */
export function resolveCellStylePatch(
  cell: EditorGridCell,
  groupStyles: Record<string, EditorGroupStyle>,
  gridStyle: EditorGridStyle,
): CellStylePatch {
  const grp = groupStyleForCell(cell, groupStyles);
  return {
    fontSize: cell.fontSize ?? grp?.fontSize ?? gridStyle.fontSize,
    cellFill: cell.cellFill ?? grp?.cellFill ?? gridStyle.cellFill,
    textColor: cell.textColor ?? grp?.textColor ?? gridStyle.fontColor,
    showBorder: cell.showBorder ?? grp?.showBorder ?? gridStyle.showBorder,
    borderColor: cell.borderColor ?? grp?.borderColor ?? gridStyle.borderColor,
    borderWidth: cell.borderWidth ?? grp?.borderWidth ?? gridStyle.borderWidth,
    borderStyle: cell.borderStyle ?? grp?.borderStyle ?? gridStyle.borderStyle,
    borderSides: cell.borderSides ?? grp?.borderSides ?? gridStyle.borderSides,
    cellDecoration: cell.cellDecoration ?? grp?.cellDecoration,
    alignH: cell.alignH ?? grp?.alignH,
    alignV: cell.alignV ?? grp?.alignV,
  };
}

export function buildStyleClipboardFromSelection(
  keys: string[],
  cells: Map<string, EditorGridCell>,
  groupStyles: Record<string, EditorGroupStyle>,
  gridStyle: EditorGridStyle,
): GridStyleClipboard | null {
  const bounds = selectionBoundsFromKeys(keys, cells);
  if (!bounds) return null;
  const { r0, r1, c0, c1 } = bounds;
  const width = c1 - c0 + 1;
  const height = r1 - r0 + 1;
  const clipCells: GridStyleClipboard["cells"] = [];

  for (const cell of cells.values()) {
    if (cell.mergedInto) continue;
    const re = cell.row + cell.rowspan - 1;
    const ce = cell.col + cell.colspan - 1;
    if (cell.row <= r1 && re >= r0 && cell.col <= c1 && ce >= c0) {
      clipCells.push({
        relRow: cell.row - r0,
        relCol: cell.col - c0,
        style: resolveCellStylePatch(cell, groupStyles, gridStyle),
      });
    }
  }

  if (clipCells.length === 0) return null;
  return { width, height, cells: clipCells };
}

export type ApplyStyleResult =
  | { ok: true; cells: Map<string, EditorGridCell> }
  | { ok: false; message: string };

/** 선택 칸에 디자인만 적용(이름·매대·병합 등 데이터는 유지) */
export function applyStyleClipboardToSelection(
  clip: GridStyleClipboard,
  targetKeys: string[],
  prev: Map<string, EditorGridCell>,
): ApplyStyleResult {
  const bounds = selectionBoundsFromKeys(targetKeys, prev);
  if (!bounds) return { ok: false, message: "스타일을 붙여넣을 칸을 선택하세요." };

  const singleStyle = clip.width === 1 && clip.height === 1 ? clip.cells[0]?.style : undefined;
  const next = new Map(prev);

  for (const key of targetKeys) {
    const cell = next.get(key);
    if (!cell || cell.mergedInto) continue;

    let style: CellStylePatch | undefined = singleStyle;
    if (!style) {
      const relR = cell.row - bounds.r0;
      const relC = cell.col - bounds.c0;
      style = clip.cells.find((c) => c.relRow === relR && c.relCol === relC)?.style;
    }
    if (!style) continue;

    next.set(key, { ...cell, ...style });
  }

  return { ok: true, cells: next };
}

/** 선택 범위와 겹치는 병합 앵커를 1×1로 해제 */
function unmergeOverlappingAnchors(
  cells: Map<string, EditorGridCell>,
  r0: number,
  c0: number,
  r1: number,
  c1: number,
): Map<string, EditorGridCell> {
  const next = new Map(cells);
  for (const cell of next.values()) {
    if (cell.mergedInto) continue;
    const re = cell.row + cell.rowspan - 1;
    const ce = cell.col + cell.colspan - 1;
    if (cell.row <= r1 && re >= r0 && cell.col <= c1 && ce >= c0) {
      if (cell.colspan === 1 && cell.rowspan === 1) continue;
      for (let r = cell.row; r <= re; r++) {
        for (let c = cell.col; c <= ce; c++) {
          const k = editorCellKey(r, c);
          const cur = next.get(k);
          if (!cur) continue;
          next.set(k, { ...cur, colspan: 1, rowspan: 1, mergedInto: null });
        }
      }
    }
  }
  return next;
}

function clearRect(
  cells: Map<string, EditorGridCell>,
  r0: number,
  c0: number,
  r1: number,
  c1: number,
): Map<string, EditorGridCell> {
  const next = unmergeOverlappingAnchors(cells, r0, c0, r1, c1);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      next.set(editorCellKey(r, c), blankCell(r, c));
    }
  }
  return next;
}

export function buildClipboardFromSelection(
  keys: string[],
  cells: Map<string, EditorGridCell>,
  groupStyles: Record<string, EditorGroupStyle>,
): GridSelectionClipboard | null {
  const bounds = selectionBoundsFromKeys(keys, cells);
  if (!bounds) return null;
  const { r0, r1, c0, c1 } = bounds;
  const width = c1 - c0 + 1;
  const height = r1 - r0 + 1;
  const clipCells: GridSelectionClipboard["cells"] = [];
  const groupCodes = new Set<string>();

  for (const cell of cells.values()) {
    if (cell.mergedInto) continue;
    const re = cell.row + cell.rowspan - 1;
    const ce = cell.col + cell.colspan - 1;
    if (cell.row <= r1 && re >= r0 && cell.col <= c1 && ce >= c0) {
      clipCells.push({
        relRow: cell.row - r0,
        relCol: cell.col - c0,
        cell: cellContent(cell),
      });
      const gc = cell.groupCode.trim();
      if (gc) groupCodes.add(gc);
    }
  }

  const copiedGroupStyles: Record<string, EditorGroupStyle> = {};
  for (const gc of groupCodes) {
    if (groupStyles[gc]) copiedGroupStyles[gc] = { ...groupStyles[gc] };
  }

  return { width, height, cells: clipCells, groupStyles: copiedGroupStyles };
}

export type PasteResult =
  | { ok: true; cells: Map<string, EditorGridCell>; pastedKeys: string[] }
  | { ok: false; message: string };

export function pasteClipboardAt(
  clip: GridSelectionClipboard,
  targetR0: number,
  targetC0: number,
  prev: Map<string, EditorGridCell>,
  cols: number,
  rows: number,
): PasteResult {
  const targetR1 = targetR0 + clip.height - 1;
  const targetC1 = targetC0 + clip.width - 1;
  if (targetR0 < 0 || targetC0 < 0 || targetR1 >= rows || targetC1 >= cols) {
    return { ok: false, message: "붙여넣기 범위가 그리드를 벗어납니다." };
  }

  let next = clearRect(prev, targetR0, targetC0, targetR1, targetC1);
  const mergeQueue: Array<{ anchorKey: string; colspan: number; rowspan: number }> = [];

  for (const item of clip.cells) {
    const r = targetR0 + item.relRow;
    const c = targetC0 + item.relCol;
    const k = editorCellKey(r, c);
    next.set(k, {
      ...item.cell,
      row: r,
      col: c,
      mergedInto: null,
      colspan: 1,
      rowspan: 1,
    });
    if (item.cell.colspan > 1 || item.cell.rowspan > 1) {
      mergeQueue.push({
        anchorKey: k,
        colspan: item.cell.colspan,
        rowspan: item.cell.rowspan,
      });
    }
  }

  for (const m of mergeQueue) {
    const res = applyCellMerge(next, cols, rows, m.anchorKey, m.colspan, m.rowspan);
    if (!res.ok) return { ok: false, message: res.message };
    next = res.cells;
  }

  const pastedKeys = rectangularCellKeys(
    cols,
    rows,
    editorCellKey(targetR0, targetC0),
    editorCellKey(targetR1, targetC1),
  );
  return { ok: true, cells: next, pastedKeys };
}

export type MoveSelectionResult =
  | { ok: true; cells: Map<string, EditorGridCell>; pastedKeys: string[]; groupStyles: Record<string, EditorGroupStyle> }
  | { ok: false; message: string };

/** 선택 영역을 Δ행·Δ열 만큼 이동(잘라내기+붙여넣기) */
export function moveSelectionByDelta(
  keys: string[],
  prev: Map<string, EditorGridCell>,
  groupStyles: Record<string, EditorGroupStyle>,
  cols: number,
  rows: number,
  deltaRow: number,
  deltaCol: number,
): MoveSelectionResult {
  if (deltaRow === 0 && deltaCol === 0) {
    return { ok: false, message: "" };
  }
  const bounds = selectionBoundsFromKeys(keys, prev);
  if (!bounds) return { ok: false, message: "이동할 칸을 선택하세요." };

  const clip = buildClipboardFromSelection(keys, prev, groupStyles);
  if (!clip) return { ok: false, message: "이동할 내용이 없습니다." };

  const targetR0 = bounds.r0 + deltaRow;
  const targetC0 = bounds.c0 + deltaCol;
  const targetR1 = targetR0 + clip.height - 1;
  const targetC1 = targetC0 + clip.width - 1;
  if (targetR0 < 0 || targetC0 < 0 || targetR1 >= rows || targetC1 >= cols) {
    return { ok: false, message: "이동 범위가 그리드를 벗어납니다." };
  }

  const cleared = clearSelectionRegion(keys, prev);
  if (!cleared) return { ok: false, message: "이동할 영역을 비울 수 없습니다." };

  const res = pasteClipboardAt(clip, targetR0, targetC0, cleared, cols, rows);
  if (!res.ok) return res;
  return { ok: true, cells: res.cells, pastedKeys: res.pastedKeys, groupStyles: clip.groupStyles };
}

export function clearSelectionRegion(
  keys: string[],
  prev: Map<string, EditorGridCell>,
): Map<string, EditorGridCell> | null {
  const bounds = selectionBoundsFromKeys(keys, prev);
  if (!bounds) return null;
  return clearRect(prev, bounds.r0, bounds.c0, bounds.r1, bounds.c1);
}
