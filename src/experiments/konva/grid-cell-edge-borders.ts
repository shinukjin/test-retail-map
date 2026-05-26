import { editorCellKey, type EditorGridCell, type EditorGridStyle, type EditorGroupStyle } from "./grid-editor-types";
import {
  borderForCell,
  cellWantsAnyBorderEdge,
  cellWantsBorderEdge,
  displayBorderForCell,
  groupStyleForCell,
  hasExplicitBorderOverride,
  hasExplicitGroupBorderOverride,
  PAD,
} from "./grid-editor-cell-draw";

/** 가로선(y 고정): 공유 경계에서 한 번만 그리기 위한 조각 */
export type HBorderSeg = {
  y: number;
  x0: number;
  x1: number;
  strokeWidth: number;
  stroke: string;
  dash?: number[];
};

/** 세로선(x 고정) */
export type VBorderSeg = {
  x: number;
  y0: number;
  y1: number;
  strokeWidth: number;
  stroke: string;
  dash?: number[];
};

function boundsPx(c: EditorGridCell, cw: number, ch: number, pad: number) {
  return {
    x: pad + c.col * cw,
    y: pad + c.row * ch,
    w: cw * c.colspan,
    h: ch * c.rowspan,
    r0: c.row,
    r1: c.row + c.rowspan,
    c0: c.col,
    c1: c.col + c.colspan,
  };
}

function overlap1D(a0: number, a1: number, b0: number, b1: number): boolean {
  return Math.max(a0, b0) < Math.min(a1, b1);
}

function borderPriority(c: EditorGridCell, grp: EditorGroupStyle | undefined): number {
  if (hasExplicitBorderOverride(c)) return 2;
  if (hasExplicitGroupBorderOverride(grp)) return 1;
  return 0;
}

type SharedEdgeBorderOptions = {
  renderDefaultBorders?: boolean;
};

function wantsRenderedBorderEdge(
  c: EditorGridCell,
  gridStyle: EditorGridStyle,
  edge: "top" | "right" | "bottom" | "left",
  grp: EditorGroupStyle | undefined,
  renderDefaultBorders: boolean,
): boolean {
  if (hasExplicitBorderOverride(c) || hasExplicitGroupBorderOverride(grp)) {
    return cellWantsBorderEdge(c, gridStyle, edge, grp);
  }
  return renderDefaultBorders || cellWantsBorderEdge(c, gridStyle, edge, grp);
}

/** [lo, hi) 스타일 구간에서 cut 구간을 뺀 나머지 */
function subtract1D(parts: [number, number][], cut: [number, number]): [number, number][] {
  const EPS = 1e-4;
  const [a, b] = cut;
  if (b - a <= EPS) return parts;
  const out: [number, number][] = [];
  for (const [lo, hi] of parts) {
    if (hi - lo <= EPS) continue;
    if (hi <= a + EPS || lo >= b - EPS) {
      out.push([lo, hi]);
      continue;
    }
    if (lo + EPS < a) out.push([lo, Math.min(hi, a)]);
    if (hi - EPS > b) out.push([Math.max(lo, b), hi]);
  }
  return out.filter(([lo, hi]) => hi - lo > EPS);
}

/**
 * 각 칸의 Rect stroke 대신, 내부 공유 변은 이웃 한쪽만 그리도록 선분을 만든다.
 * - 가로 이음: 위 칸이 **아래 변**을 그리면 아래 칸은 **위 변** 해당 구간 제외
 * - 세로 이음: 왼쪽 칸이 **오른쪽 변**을 그리면 오른쪽 칸은 **왼쪽 변** 해당 구간 제외
 * - `borderSides`로 변별 on/off
 */
export function computeSharedEdgeBorderSegments(
  anchors: EditorGridCell[],
  gridStyle: EditorGridStyle,
  groupStyles?: Record<string, EditorGroupStyle>,
  options: SharedEdgeBorderOptions = {},
): { horizontal: HBorderSeg[]; vertical: VBorderSeg[] } {
  const cw = gridStyle.cellWidth;
  const ch = gridStyle.cellHeight;
  const pad = PAD;

  const horizontal: HBorderSeg[] = [];
  const vertical: VBorderSeg[] = [];

  for (const c of anchors) {
    const grpC = groupStyleForCell(c, groupStyles);
    const b = options.renderDefaultBorders
      ? displayBorderForCell(c, gridStyle, grpC)
      : borderForCell(c, gridStyle, grpC);
    const priority = borderPriority(c, grpC);
    if (b.width <= 0 || b.color === "transparent") continue;
    if (!options.renderDefaultBorders && !cellWantsAnyBorderEdge(c, gridStyle, grpC)) continue;

    const { x, y, w, h, r0, r1, c0, c1 } = boundsPx(c, cw, ch, pad);

    // ---- top (y 고정)
    if (wantsRenderedBorderEdge(c, gridStyle, "top", grpC, !!options.renderDefaultBorders)) {
      let topParts: [number, number][] = [[x, x + w]];
      for (const n of anchors) {
        if (editorCellKey(n.row, n.col) === editorCellKey(c.row, c.col)) continue;
        const bn = boundsPx(n, cw, ch, pad);
        if (bn.r1 !== r0) continue;
        if (!overlap1D(c0, c1, bn.c0, bn.c1)) continue;
        const grpN = groupStyleForCell(n, groupStyles);
        const neighborHasEdge = wantsRenderedBorderEdge(n, gridStyle, "bottom", grpN, !!options.renderDefaultBorders);
        if (neighborHasEdge && borderPriority(n, grpN) >= priority) {
          const ix0 = Math.max(x, bn.x);
          const ix1 = Math.min(x + w, bn.x + bn.w);
          if (ix1 > ix0) topParts = subtract1D(topParts, [ix0, ix1]);
        }
      }
      for (const [x0, x1] of topParts) {
        if (x1 - x0 > 1e-3)
          horizontal.push({ y, x0, x1, strokeWidth: b.width, stroke: b.color, dash: b.dash });
      }
    }

    // ---- bottom
    if (wantsRenderedBorderEdge(c, gridStyle, "bottom", grpC, !!options.renderDefaultBorders)) {
      const yb = y + h;
      const botParts: [number, number][] = [[x, x + w]];
      for (const [x0, x1] of botParts) {
        if (x1 - x0 > 1e-3)
          horizontal.push({ y: yb, x0, x1, strokeWidth: b.width, stroke: b.color, dash: b.dash });
      }
    }

    // ---- left
    if (wantsRenderedBorderEdge(c, gridStyle, "left", grpC, !!options.renderDefaultBorders)) {
      let leftParts: [number, number][] = [[y, y + h]];
      for (const n of anchors) {
        if (editorCellKey(n.row, n.col) === editorCellKey(c.row, c.col)) continue;
        const bn = boundsPx(n, cw, ch, pad);
        if (bn.c1 !== c0) continue;
        if (!overlap1D(r0, r1, bn.r0, bn.r1)) continue;
        const grpN = groupStyleForCell(n, groupStyles);
        const neighborHasEdge = wantsRenderedBorderEdge(n, gridStyle, "right", grpN, !!options.renderDefaultBorders);
        if (neighborHasEdge && borderPriority(n, grpN) >= priority) {
          const iy0 = Math.max(y, bn.y);
          const iy1 = Math.min(y + h, bn.y + bn.h);
          if (iy1 > iy0) leftParts = subtract1D(leftParts, [iy0, iy1]);
        }
      }
      for (const [y0, y1] of leftParts) {
        if (y1 - y0 > 1e-3)
          vertical.push({ x, y0, y1, strokeWidth: b.width, stroke: b.color, dash: b.dash });
      }
    }

    // ---- right
    if (wantsRenderedBorderEdge(c, gridStyle, "right", grpC, !!options.renderDefaultBorders)) {
      const xr = x + w;
      const rightParts: [number, number][] = [[y, y + h]];
      for (const [y0, y1] of rightParts) {
        if (y1 - y0 > 1e-3)
          vertical.push({ x: xr, y0, y1, strokeWidth: b.width, stroke: b.color, dash: b.dash });
      }
    }
  }

  return { horizontal, vertical };
}
