import type { EditorGridCell } from "@/experiments/konva/grid-editor-types";
import { editorCellKey } from "@/experiments/konva/grid-editor-types";

/** 선택 키들이 덮는 그리드 인덱스 범위(병합 칸은 rowspan/colspan 반영) */
export function selectionBoundsFromKeys(
  keys: string[],
  cells: Map<string, EditorGridCell>,
): { r0: number; r1: number; c0: number; c1: number } | null {
  let r0 = Infinity;
  let r1 = -Infinity;
  let c0 = Infinity;
  let c1 = -Infinity;
  for (const k of keys) {
    const cell = cells.get(k);
    if (!cell) continue;
    const rs = cell.row;
    const cs = cell.col;
    const re = cell.row + cell.rowspan - 1;
    const ce = cell.col + cell.colspan - 1;
    r0 = Math.min(r0, rs);
    r1 = Math.max(r1, re);
    c0 = Math.min(c0, cs);
    c1 = Math.max(c1, ce);
  }
  if (!Number.isFinite(r0) || r1 < r0 || c1 < c0) return null;
  return { r0, r1, c0, c1 };
}

/** 범위와 행이 겹치는 모든 앵커(병합 시작) 칸 키 */
export function anchorKeysTouchingRowSpan(
  r0: number,
  r1: number,
  cells: Map<string, EditorGridCell>,
): string[] {
  const out: string[] = [];
  for (const c of cells.values()) {
    if (c.mergedInto) continue;
    const re = c.row + c.rowspan - 1;
    if (c.row <= r1 && re >= r0) out.push(editorCellKey(c.row, c.col));
  }
  return out;
}

/** 범위와 열이 겹치는 모든 앵커 칸 키 */
export function anchorKeysTouchingColSpan(
  c0: number,
  c1: number,
  cells: Map<string, EditorGridCell>,
): string[] {
  const out: string[] = [];
  for (const c of cells.values()) {
    if (c.mergedInto) continue;
    const ce = c.col + c.colspan - 1;
    if (c.col <= c1 && ce >= c0) out.push(editorCellKey(c.row, c.col));
  }
  return out;
}

export function allAnchorKeys(cells: Map<string, EditorGridCell>): string[] {
  return Array.from(cells.values())
    .filter((c) => !c.mergedInto)
    .map((c) => editorCellKey(c.row, c.col));
}

export function growSelectionRect(
  cols: number,
  rows: number,
  keys: string[],
  cells: Map<string, EditorGridCell>,
  dir: "up" | "down" | "left" | "right",
): string[] {
  const b = selectionBoundsFromKeys(keys, cells);
  if (!b) return keys;
  let { r0, r1, c0, c1 } = b;
  if (dir === "up") r0 = Math.max(0, r0 - 1);
  else if (dir === "down") r1 = Math.min(rows - 1, r1 + 1);
  else if (dir === "left") c0 = Math.max(0, c0 - 1);
  else if (dir === "right") c1 = Math.min(cols - 1, c1 + 1);
  return rectangularCellKeys(cols, rows, editorCellKey(r0, c0), editorCellKey(r1, c1));
}

/** 바깥 한 줄을 제외한 직사각 내부 칸(Shift 범위와 동일한 키 집합 규칙) */
export function shrinkSelectionToInnerRect(
  cols: number,
  rows: number,
  keys: string[],
  cells: Map<string, EditorGridCell>,
): string[] {
  const b = selectionBoundsFromKeys(keys, cells);
  if (!b) return keys;
  const r0 = b.r0 + 1;
  const r1 = b.r1 - 1;
  const c0 = b.c0 + 1;
  const c1 = b.c1 - 1;
  if (r0 > r1 || c0 > c1) return keys;
  return rectangularCellKeys(cols, rows, editorCellKey(r0, c0), editorCellKey(r1, c1));
}

/**
 * 선택된 키가 모두 1×1 앵커 칸이고, 빈틈 없는 직사각형이면 병합에 쓸 앵커(좌상)·크기 반환.
 * 그렇지 않으면 null.
 */
export function solidAnchorRectangleForMerge(
  keys: string[],
  cells: Map<string, EditorGridCell>,
): { anchorKey: string; colspan: number; rowspan: number } | null {
  if (keys.length < 2) return null;
  const uniq = [...new Set(keys)];
  if (uniq.length !== keys.length) return null;
  const list: EditorGridCell[] = [];
  for (const k of uniq) {
    const c = cells.get(k);
    if (!c || c.mergedInto) return null;
    if (c.colspan !== 1 || c.rowspan !== 1) return null;
    list.push(c);
  }
  const r0 = Math.min(...list.map((c) => c.row));
  const r1 = Math.max(...list.map((c) => c.row));
  const c0 = Math.min(...list.map((c) => c.col));
  const c1 = Math.max(...list.map((c) => c.col));
  const w = c1 - c0 + 1;
  const h = r1 - r0 + 1;
  if (w * h !== uniq.length) return null;
  const keySet = new Set(uniq);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (!keySet.has(editorCellKey(r, c))) return null;
    }
  }
  return { anchorKey: editorCellKey(r0, c0), colspan: w, rowspan: h };
}

/** 두 칸 키를 꼭짓점으로 하는 축 정렬 직사각형 안의 모든 칸 키 */
export function rectangularCellKeys(
  cols: number,
  rows: number,
  keyFrom: string,
  keyTo: string,
): string[] {
  const parse = (k: string) => {
    const [r, c] = k.split("-").map(Number);
    return { r, c };
  };
  const a = parse(keyFrom);
  const b = parse(keyTo);
  if ([a.r, a.c, b.r, b.c].some((n) => !Number.isFinite(n))) return [];
  const r0 = Math.min(a.r, b.r);
  const r1 = Math.max(a.r, b.r);
  const c0 = Math.min(a.c, b.c);
  const c1 = Math.max(a.c, b.c);
  const out: string[] = [];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (r >= 0 && c >= 0 && r < rows && c < cols) out.push(editorCellKey(r, c));
    }
  }
  return out;
}
