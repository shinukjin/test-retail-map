import type { FloorPlanSnapshot } from "@/domain/floor-plan-snapshot";
import type { EditorGridCell } from "@/experiments/konva/grid-editor-types";
import { defaultEditorGridStyle, editorCellKey } from "@/experiments/konva/grid-editor-types";
import type { EditorGridSnapshot } from "@/experiments/konva/grid-snapshot";

export type FloorPlanToGridOptions = {
  cols: number;
  rows: number;
};

/**
 * FloorPlanSnapshot의 ShelfLayout[] 을 EditorGridSnapshot으로 변환합니다.
 * 각 ShelfLayout의 픽셀 bbox를 격자 row/col/colspan/rowspan으로 스냅합니다.
 */
export function floorPlanToGrid(
  snap: FloorPlanSnapshot,
  opts: FloorPlanToGridOptions,
): EditorGridSnapshot {
  const { cols, rows } = opts;
  const { floorPlan, shelves } = snap;

  const cellW = floorPlan.width / cols;
  const cellH = floorPlan.height / rows;

  const gridStyle = {
    ...defaultEditorGridStyle(),
    showBorder: true,
    borderWidth: 1,
    borderColor: "#94a3b8",
  };

  const cellMap = new Map<string, EditorGridCell>();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell: EditorGridCell = {
        row: r,
        col: c,
        shelfCode: "",
        tier: null,
        cellName: "",
        groupCode: "",
        colspan: 1,
        rowspan: 1,
        mergedInto: null,
      };
      cellMap.set(editorCellKey(r, c), cell);
    }
  }

  const usedKeys = new Set<string>();

  const sortedShelves = [...shelves].sort((a, b) => {
    const aArea = a.width * a.height;
    const bArea = b.width * b.height;
    return bArea - aArea;
  });

  for (const shelf of sortedShelves) {
    const col0 = Math.max(0, Math.floor(shelf.x / cellW));
    const row0 = Math.max(0, Math.floor(shelf.y / cellH));
    const col1 = Math.min(cols - 1, Math.floor((shelf.x + shelf.width - 1) / cellW));
    const row1 = Math.min(rows - 1, Math.floor((shelf.y + shelf.height - 1) / cellH));
    if (col0 > col1 || row0 > row1) continue;

    const anchorKey = editorCellKey(row0, col0);
    if (usedKeys.has(anchorKey)) continue;

    const cs = col1 - col0 + 1;
    const rs = row1 - row0 + 1;

    let overlaps = false;
    for (let r = row0; r <= row1; r++) {
      for (let c = col0; c <= col1; c++) {
        if (usedKeys.has(editorCellKey(r, c))) { overlaps = true; break; }
      }
      if (overlaps) break;
    }
    if (overlaps) continue;

    const anchor = cellMap.get(anchorKey);
    if (!anchor) continue;
    const updated: EditorGridCell = {
      ...anchor,
      shelfCode: shelf.bayCode ?? "",
      cellName: shelf.label,
      groupCode: shelf.sectionCode ?? "",
      colspan: cs,
      rowspan: rs,
    };
    cellMap.set(anchorKey, updated);
    usedKeys.add(anchorKey);

    for (let r = row0; r <= row1; r++) {
      for (let c = col0; c <= col1; c++) {
        if (r === row0 && c === col0) continue;
        const key = editorCellKey(r, c);
        const cell = cellMap.get(key);
        if (cell) {
          cellMap.set(key, { ...cell, mergedInto: anchorKey });
          usedKeys.add(key);
        }
      }
    }
  }

  const cells: EditorGridCell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cellMap.get(editorCellKey(r, c));
      if (cell) cells.push(cell);
    }
  }

  return { cols, rows, gridStyle, cells };
}
