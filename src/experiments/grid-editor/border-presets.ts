import type { BorderSides } from "@/experiments/konva/grid-editor-types";

/** 테두리 면 일괄 프리셋 — 패널·모델에서 동일 참조 */
export const BORDER_PRESET_SIDES: Record<"all" | "lr" | "tb" | "none", BorderSides> = {
  all: { top: true, right: true, bottom: true, left: true },
  lr: { top: false, right: true, bottom: false, left: true },
  tb: { top: true, right: false, bottom: true, left: false },
  none: { top: false, right: false, bottom: false, left: false },
};

export const BORDER_EDGE_ORDER = ["top", "bottom", "left", "right"] as const;

export type BorderEdgeKey = (typeof BORDER_EDGE_ORDER)[number];
