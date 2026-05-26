import type {
  EditorGridCell,
  EditorGridStyle,
  EditorGroupStyle,
} from "@/experiments/konva/grid-editor-types";

export type GridHistorySnapshot = {
  cols: number;
  rows: number;
  cells: Map<string, EditorGridCell>;
  groupStyles: Record<string, EditorGroupStyle>;
  gridStyle: EditorGridStyle;
};

export function captureGridHistorySnapshot(
  cols: number,
  rows: number,
  cells: Map<string, EditorGridCell>,
  groupStyles: Record<string, EditorGroupStyle>,
  gridStyle: EditorGridStyle,
): GridHistorySnapshot {
  const clonedCells = new Map<string, EditorGridCell>();
  for (const [k, c] of cells) clonedCells.set(k, { ...c });
  return {
    cols,
    rows,
    cells: clonedCells,
    groupStyles: { ...groupStyles },
    gridStyle: { ...gridStyle },
  };
}
