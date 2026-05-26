import type { EditorGridCell, EditorGridStyle, EditorGroupStyle } from "@/experiments/konva/grid-editor-types";
import { editorCellKey } from "@/experiments/konva/grid-editor-types";
import { groupStyleForCell } from "@/experiments/konva/grid-editor-cell-draw";

/** 테두리 세gment 재계산이 필요한지 판별용 짧은 지문 */
export function gridBorderFingerprint(
  anchors: EditorGridCell[],
  gridStyle: EditorGridStyle,
  groupStyles: Record<string, EditorGroupStyle>,
): string {
  const g = `${gridStyle.showBorder}|${gridStyle.borderWidth}|${gridStyle.borderColor}|${gridStyle.borderStyle}|${JSON.stringify(gridStyle.borderSides ?? null)}|${gridStyle.cellWidth}|${gridStyle.cellHeight}`;
  const parts: string[] = [g];
  for (const c of anchors) {
    const grp = groupStyleForCell(c, groupStyles);
    parts.push(
      `${editorCellKey(c.row, c.col)}:${c.colspan}x${c.rowspan}:${c.showBorder ?? ""}:${c.borderWidth ?? ""}:${c.borderColor ?? ""}:${c.borderStyle ?? ""}:${JSON.stringify(c.borderSides ?? null)}:${grp?.showBorder ?? ""}:${grp?.borderWidth ?? ""}:${grp?.borderColor ?? ""}:${grp?.borderStyle ?? ""}:${JSON.stringify(grp?.borderSides ?? null)}`,
    );
  }
  return parts.join(";");
}
