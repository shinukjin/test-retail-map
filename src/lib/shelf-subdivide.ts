import type { ShelfLayout } from "@/domain/types";
import {
  entryAt,
  partitionTotal,
  type SubdivideEntry,
} from "@/lib/zone-subdivide-utils";

/** 선택 shelf bbox를 N×M 하위 shelf로 분할합니다. */
export function subdivideShelfLayout(
  shelf: ShelfLayout,
  subdivCols: number,
  subdivRows: number,
  entries: SubdivideEntry[],
): ShelfLayout[] {
  const colWidths = partitionTotal(Math.max(1, Math.round(shelf.width)), subdivCols);
  const rowHeights = partitionTotal(Math.max(1, Math.round(shelf.height)), subdivRows);
  const children: ShelfLayout[] = [];
  const stamp = Date.now();

  let y = shelf.y;
  for (let r = 0; r < subdivRows; r++) {
    let x = shelf.x;
    for (let c = 0; c < subdivCols; c++) {
      const entry = entryAt(entries, r, c);
      const w = colWidths[c] ?? 1;
      const h = rowHeights[r] ?? 1;
      children.push({
        ...shelf,
        id: `${shelf.id}-sub-${r}-${c}-${stamp}`,
        x: Math.round(x),
        y: Math.round(y),
        width: w,
        height: h,
        label: entry?.label.trim() || shelf.label,
        bayCode: entry?.bayCode.trim() || shelf.bayCode,
        sectionCode: entry?.code.trim() || shelf.sectionCode,
      });
      x += w;
    }
    y += rowHeights[r] ?? 1;
  }

  return children;
}
