import type { EditorGridCell, EditorGroupStyle } from "./grid-editor-types";
import { editorCellKey } from "./grid-editor-types";
import { applyCellMerge } from "./grid-merge";
import {
  entryAt,
  partitionTotal,
  type SubdivideEntry,
  validateSubdivideCounts,
} from "@/lib/zone-subdivide-utils";

const SUBZONE_FILLS = ["#dbeafe", "#dcfce7", "#fef3c7", "#fce7f3", "#e0e7ff", "#ccfbf1", "#fae8ff", "#ffedd5"];

export type GridSubdivideResult =
  | { ok: true; cells: Map<string, EditorGridCell>; groupStyles: Record<string, EditorGroupStyle> }
  | { ok: false; message: string };

function buildSubGroupStyles(
  entries: SubdivideEntry[],
  parentGroupCode: string,
  existing: Record<string, EditorGroupStyle>,
): Record<string, EditorGroupStyle> {
  const parentKey = parentGroupCode.trim();
  const parentStyle = parentKey ? existing[parentKey] : undefined;
  const next = { ...existing };

  entries.forEach((entry, i) => {
    const gc = entry.code.trim().slice(0, 40);
    if (!gc) return;
    next[gc] = {
      ...parentStyle,
      cellFill: SUBZONE_FILLS[i % SUBZONE_FILLS.length],
      showBorder: true,
      borderWidth: Math.max(1, parentStyle?.borderWidth ?? 1),
    };
  });

  return next;
}

function withFallback(base: string, rowIndex: number, colIndex: number): string {
  const b = base.trim();
  if (!b) return `${rowIndex + 1}-${colIndex + 1}`;
  return b;
}

/**
 * 병합 앵커 구획을 N×M 하위 구획으로 나눕니다.
 * 각 하위 구획은 격자 병합 블록(앵커)으로 유지됩니다.
 */
export function applyGridSubdivide(
  prev: Map<string, EditorGridCell>,
  groupStyles: Record<string, EditorGroupStyle>,
  cols: number,
  rows: number,
  anchorKey: string,
  subdivCols: number,
  subdivRows: number,
  entries: SubdivideEntry[],
): GridSubdivideResult {
  const anchor = prev.get(anchorKey);
  if (!anchor) return { ok: false, message: "칸을 찾을 수 없습니다." };
  if (anchor.mergedInto) return { ok: false, message: "병합 시작 칸에서만 세분화할 수 있습니다." };

  const validation = validateSubdivideCounts(anchor.colspan, anchor.rowspan, subdivCols, subdivRows);
  if (validation) return { ok: false, message: validation };

  const origRow = anchor.row;
  const origCol = anchor.col;
  const origColspan = anchor.colspan;
  const origRowspan = anchor.rowspan;
  const parentGroup = anchor.groupCode;
  const parentName = anchor.cellName;
  const parentBay = anchor.shelfCode;

  const colChunks = partitionTotal(origColspan, subdivCols);
  const rowChunks = partitionTotal(origRowspan, subdivRows);

  let working = new Map(prev);
  const unmerge = applyCellMerge(working, cols, rows, anchorKey, 1, 1);
  if (!unmerge.ok) return { ok: false, message: unmerge.message };
  working = unmerge.cells;

  let rowOffset = origRow;
  for (let r = 0; r < subdivRows; r++) {
    let colOffset = origCol;
    const rs = rowChunks[r] ?? 1;
    for (let c = 0; c < subdivCols; c++) {
      const cs = colChunks[c] ?? 1;
      const subAnchorKey = editorCellKey(rowOffset, colOffset);
      const entry = entryAt(entries, r, c);

      const mergeRes = applyCellMerge(working, cols, rows, subAnchorKey, cs, rs);
      if (!mergeRes.ok) return { ok: false, message: mergeRes.message };
      working = mergeRes.cells;

      const subAnchor = working.get(subAnchorKey);
      if (!subAnchor) return { ok: false, message: "세분화 중 칸을 잃었습니다." };

      working.set(subAnchorKey, {
        ...subAnchor,
        groupCode: (entry?.code.trim() || withFallback(parentGroup, r, c)).slice(0, 40),
        cellName: entry?.label.trim() || withFallback(parentName, r, c),
        shelfCode: entry?.bayCode.trim() || withFallback(parentBay, r, c),
      });

      colOffset += cs;
    }
    rowOffset += rs;
  }

  const nextGroupStyles = buildSubGroupStyles(entries, parentGroup, groupStyles);
  return { ok: true, cells: working, groupStyles: nextGroupStyles };
}
