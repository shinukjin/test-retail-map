import type { EditorGridCell } from "./grid-editor-types";
import { editorCellKey } from "./grid-editor-types";

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export type MergeResult =
  | { ok: true; cells: Map<string, EditorGridCell> }
  | { ok: false; message: string };

/**
 * anchor 칸을 기준으로 colspan×rowspan 병합.
 * 기존에 이 anchor로 묶였던 칸은 먼저 해제한 뒤, 새 범위를 검사합니다.
 */
export function applyCellMerge(
  prev: Map<string, EditorGridCell>,
  cols: number,
  rows: number,
  anchorKey: string,
  colspan: number,
  rowspan: number,
): MergeResult {
  const anchor = prev.get(anchorKey);
  if (!anchor) return { ok: false, message: "칸을 찾을 수 없습니다." };
  if (anchor.mergedInto) {
    return { ok: false, message: "병합에 포함된 칸은 시작 칸에서만 병합을 바꿀 수 있습니다." };
  }

  const ac = anchor.col;
  const ar = anchor.row;
  const cs = clamp(Math.floor(colspan) || 1, 1, cols - ac);
  const rs = clamp(Math.floor(rowspan) || 1, 1, rows - ar);

  const n = new Map(prev);

  for (const [k, cell] of n) {
    if (cell.mergedInto === anchorKey) {
      n.set(k, { ...cell, mergedInto: null, colspan: 1, rowspan: 1 });
    }
  }

  const resetAnchor = n.get(anchorKey)!;
  n.set(anchorKey, { ...resetAnchor, colspan: 1, rowspan: 1, mergedInto: null });

  for (let r = ar; r < ar + rs; r++) {
    for (let c = ac; c < ac + cs; c++) {
      const k = editorCellKey(r, c);
      const cell = n.get(k);
      if (!cell) return { ok: false, message: "범위가 잘못되었습니다." };
      if (r === ar && c === ac) continue;
      if (cell.mergedInto) {
        return { ok: false, message: "다른 병합 영역과 겹칩니다." };
      }
      if (cell.colspan > 1 || cell.rowspan > 1) {
        return { ok: false, message: "이미 병합된 시작 칸이 포함되어 있습니다." };
      }
    }
  }

  for (let r = ar; r < ar + rs; r++) {
    for (let c = ac; c < ac + cs; c++) {
      const k = editorCellKey(r, c);
      const cell = n.get(k)!;
      if (r === ar && c === ac) {
        n.set(k, { ...cell, colspan: cs, rowspan: rs, mergedInto: null });
      } else {
        n.set(k, {
          ...cell,
          colspan: 1,
          rowspan: 1,
          mergedInto: anchorKey,
        });
      }
    }
  }

  return { ok: true, cells: n };
}
