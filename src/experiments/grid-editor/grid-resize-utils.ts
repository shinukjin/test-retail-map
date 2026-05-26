import type { EditorGridCell } from "@/experiments/konva/grid-editor-types";
import { editorCellKey } from "@/experiments/konva/grid-editor-types";
import { applyCellMerge } from "@/experiments/konva/grid-merge";
import { resolveAnchorCell } from "./grid-inquiry-utils";
import { selectionBoundsFromKeys, solidAnchorRectangleForMerge } from "./grid-selection-utils";

export type ResizeHandle = "se" | "e" | "s";

export type ResizeSpec = {
  anchorKey: string;
  r0: number;
  c0: number;
  r1: number;
  c1: number;
};

export type ResizePreview = {
  anchorKey: string;
  originBounds: { r0: number; r1: number; c0: number; c1: number };
  targetBounds: { r0: number; r1: number; c0: number; c1: number };
  handle: ResizeHandle;
  valid: boolean;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/** 선택 영역에서 마우스 리사이즈 가능한 앵커·범위 */
export function resolveResizeSpec(
  keys: string[],
  cells: Map<string, EditorGridCell>,
): ResizeSpec | null {
  if (keys.length === 0) return null;

  if (keys.length === 1) {
    const anchor = resolveAnchorCell(cells, keys[0]!);
    if (!anchor || anchor.mergedInto) return null;
    return {
      anchorKey: editorCellKey(anchor.row, anchor.col),
      r0: anchor.row,
      c0: anchor.col,
      r1: anchor.row + anchor.rowspan - 1,
      c1: anchor.col + anchor.colspan - 1,
    };
  }

  const bounds = selectionBoundsFromKeys(keys, cells);
  if (!bounds) return null;
  const mergeSpec = solidAnchorRectangleForMerge(keys, cells);
  if (!mergeSpec) return null;
  return {
    anchorKey: mergeSpec.anchorKey,
    r0: bounds.r0,
    c0: bounds.c0,
    r1: bounds.r1,
    c1: bounds.c1,
  };
}

export function targetBoundsFromGridCell(
  spec: ResizeSpec,
  targetRow: number,
  targetCol: number,
  handle: ResizeHandle,
  rows: number,
  cols: number,
): { r0: number; r1: number; c0: number; c1: number } {
  let r1 = spec.r1;
  let c1 = spec.c1;
  if (handle === "se" || handle === "s") {
    r1 = clamp(targetRow, spec.r0, rows - 1);
  }
  if (handle === "se" || handle === "e") {
    c1 = clamp(targetCol, spec.c0, cols - 1);
  }
  return { r0: spec.r0, c0: spec.c0, r1, c1 };
}

export function buildResizePreview(
  spec: ResizeSpec,
  targetRow: number,
  targetCol: number,
  handle: ResizeHandle,
  cells: Map<string, EditorGridCell>,
  cols: number,
  rows: number,
): ResizePreview {
  const targetBounds = targetBoundsFromGridCell(spec, targetRow, targetCol, handle, rows, cols);
  const colspan = targetBounds.c1 - targetBounds.c0 + 1;
  const rowspan = targetBounds.r1 - targetBounds.r0 + 1;
  const valid = applyCellMerge(cells, cols, rows, spec.anchorKey, colspan, rowspan).ok;
  return {
    anchorKey: spec.anchorKey,
    originBounds: { r0: spec.r0, r1: spec.r1, c0: spec.c0, c1: spec.c1 },
    targetBounds,
    handle,
    valid,
  };
}

export function mergeSizeUnchanged(spec: ResizeSpec, preview: ResizePreview): boolean {
  return (
    preview.targetBounds.r1 === spec.r1 &&
    preview.targetBounds.c1 === spec.c1 &&
    preview.targetBounds.r0 === spec.r0 &&
    preview.targetBounds.c0 === spec.c0
  );
}
