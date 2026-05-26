import type { EditorGridCell } from "@/experiments/konva/grid-editor-types";

/** 병합 하위 칸이면 시작 칸(앵커)까지 따라가서 한 칸으로 본다 */
export function resolveAnchorCell(
  cells: Map<string, EditorGridCell>,
  key: string,
): EditorGridCell | null {
  let cur = cells.get(key);
  if (!cur) return null;
  const seen = new Set<string>();
  while (cur.mergedInto) {
    if (seen.has(cur.mergedInto)) break;
    seen.add(cur.mergedInto);
    const next = cells.get(cur.mergedInto);
    if (!next) break;
    cur = next;
  }
  return cur;
}
