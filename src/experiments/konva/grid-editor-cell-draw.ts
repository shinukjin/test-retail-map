import type { BorderLineStyle, BorderSides, EditorGridCell, EditorGridStyle, EditorGroupStyle, TextAlignV } from "./grid-editor-types";

export const PAD = 12;
export const TEXT_PAD = 4;
export const DEFAULT_BORDER_COLOR = "#94a3b8";
export const DEFAULT_BORDER_WIDTH = 1;
export const DEFAULT_BORDER_STYLE: BorderLineStyle = "solid";

/** Konva Text `lineHeight`(글자 높이 대비 배수) — 세로 정렬 안정화 */
export const GRID_TEXT_LINE_HEIGHT = 1.2;

/**
 * 셀 사각형 (cellX, cellY, cellW, cellH) 안쪽 텍스트 영역.
 * Konva·Fabric 동일 좌표로 정렬을 맞춤.
 */
export function cellInnerTextBox(
  cellX: number,
  cellY: number,
  cellWidth: number,
  cellHeight: number,
): { x: number; y: number; w: number; h: number } {
  return {
    x: cellX + TEXT_PAD,
    y: cellY + TEXT_PAD,
    w: Math.max(1, cellWidth - TEXT_PAD * 2),
    h: Math.max(1, cellHeight - TEXT_PAD * 2),
  };
}

/** 줄바꿈 없이 대략적인 줄 수 → 세로 정렬용 블록 높이 */
export function estimateTextBlockHeight(
  text: string,
  fontSize: number,
  innerWidth: number,
  innerHeight: number,
  lineHeightMult: number,
): number {
  if (fontSize <= 0) return 0;
  const avgCharPx = fontSize * 0.58;
  const charsPerLine = Math.max(1, Math.floor(innerWidth / avgCharPx));
  const lines = Math.max(1, Math.ceil((text.length === 0 ? 1 : text.length) / charsPerLine));
  const lineH = fontSize * lineHeightMult;
  return Math.min(innerHeight, lines * lineH);
}

/**
 * Konva Text: 세로 정렬을 직접 박스로 맞춤(verticalAlign middle/bottom 시 기준선 편향·넘침 완화).
 * 반환 박스는 항상 `verticalAlign="top"` 과 함께 쓰는 것을 전제로 함.
 */
export function konvaTextBoxForVerticalAlign(
  alignV: TextAlignV,
  inner: { x: number; y: number; w: number; h: number },
  label: string,
  fontSize: number,
  lineHeightMult: number,
): { x: number; y: number; w: number; h: number } {
  const approxH = estimateTextBlockHeight(label, fontSize, inner.w, inner.h, lineHeightMult);
  let boxTop = inner.y;
  if (alignV === "middle") boxTop = inner.y + (inner.h - approxH) / 2;
  else if (alignV === "bottom") boxTop = inner.y + inner.h - approxH;
  const maxTop = inner.y + Math.max(0, inner.h - approxH);
  boxTop = Math.max(inner.y, Math.min(boxTop, maxTop));
  const boxH = Math.max(1, inner.y + inner.h - boxTop);
  return { x: inner.x, y: boxTop, w: inner.w, h: boxH };
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * `<input type="color">`·Konva/Fabric stroke·fill에 안전한 #rrggbb.
 * `#rgb` 확장, `rgb(...)` 변환, 그 외 비어 있으면 fallback.
 */
export function normalizeColorHex(input: string, fallback: string): string {
  const s = input.trim();
  if (!s) return fallback;
  if (s.startsWith("#")) {
    if (s.length === 4 && /^#[0-9a-fA-F]{3}$/.test(s)) {
      const r = s[1]!;
      const g = s[2]!;
      const b = s[3]!;
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    if (/^#[0-9a-fA-F]{8}$/.test(s)) return `#${s.slice(1, 7).toLowerCase()}`;
    return fallback;
  }
  const m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(s);
  if (m) {
    const r = clamp(parseInt(m[1], 10), 0, 255);
    const g = clamp(parseInt(m[2], 10), 0, 255);
    const b = clamp(parseInt(m[3], 10), 0, 255);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }
  if (/^[a-zA-Z]+$/.test(s) && s.length <= 20) return s;
  return fallback;
}

/** `displayLabel` 옵션 — 편집기에서 전역 기본 좌표만 숨길 때 사용(이름·매대·그룹 라벨은 유지) */
export type DisplayLabelOptions = {
  hideCellInteriorText?: boolean;
};

/** `editor`: 설계(도면 생성) — 칸 이름·좌표 표시. `applied`: 실제 적용/조회 — 설계용 위치명만 숨김 */
export type GridCellLabelMode = "editor" | "applied";

export function displayLabel(
  c: EditorGridCell,
  mode: GridCellLabelMode = "editor",
  opts?: DisplayLabelOptions,
): string {
  const hideDefaultCoord = opts?.hideCellInteriorText;
  if (mode === "editor" && c.cellName.trim()) return c.cellName.trim().slice(0, 24);
  if (c.shelfCode.trim()) {
    const t = c.tier != null ? `${c.tier}` : "";
    const base = c.shelfCode.trim().slice(0, 12);
    const g = c.groupCode.trim() ? `[${c.groupCode.trim().slice(0, 8)}] ` : "";
    return t ? `${g}${base}-${t}` : `${g}${base}`;
  }
  if (c.groupCode.trim()) return `[${c.groupCode.trim().slice(0, 18)}]`;
  if (mode === "applied") return "";
  if (hideDefaultCoord) return "";
  return `${c.col + 1},${c.row + 1}`;
}

/** Konva `dash` / Fabric `strokeDashArray` — `solid`는 `undefined` */
export function dashForBorderLineStyle(
  style: BorderLineStyle,
  strokeWidth: number,
): number[] | undefined {
  if (style === "solid") return undefined;
  const w = Math.max(1, strokeWidth);
  if (style === "dashed") return [w * 4, w * 2];
  if (style === "dotted") return [w, w * 1.6];
  return undefined;
}

/** `groupCode`에 해당하는 그룹 공통 스타일(없으면 undefined) */
export function groupStyleForCell(
  c: EditorGridCell,
  groupStyles: Record<string, EditorGroupStyle> | undefined,
): EditorGroupStyle | undefined {
  if (!groupStyles) return undefined;
  const k = c.groupCode.trim();
  if (!k) return undefined;
  return groupStyles[k];
}

/**
 * 셀 테두리(데이터 기준). 선택 강조는 별도 오버레이로 그려 테두리 색·두께와 겹치지 않게 함.
 * 우선순위: 셀 → 그룹 → 전역
 */
export function borderForCell(
  c: EditorGridCell,
  g: EditorGridStyle,
  grp?: EditorGroupStyle,
): { width: number; color: string; dash?: number[] } {
  const use = c.showBorder ?? grp?.showBorder ?? g.showBorder;
  if (!use) return { width: 0, color: "transparent" };
  const w = c.borderWidth ?? grp?.borderWidth ?? g.borderWidth;
  if (w <= 0) return { width: 0, color: "transparent" };
  const raw = c.borderColor ?? grp?.borderColor ?? g.borderColor;
  const style: BorderLineStyle = c.borderStyle ?? grp?.borderStyle ?? g.borderStyle ?? DEFAULT_BORDER_STYLE;
  const color = normalizeColorHex(raw, normalizeColorHex(g.borderColor, DEFAULT_BORDER_COLOR));
  return { width: w, color, dash: dashForBorderLineStyle(style, w) };
}

export function hasExplicitBorderOverride(c: EditorGridCell): boolean {
  return (
    c.showBorder !== undefined ||
    c.borderColor !== undefined ||
    c.borderWidth !== undefined ||
    c.borderStyle !== undefined ||
    c.borderSides !== undefined
  );
}

export function hasExplicitGroupBorderOverride(grp: EditorGroupStyle | undefined): boolean {
  if (!grp) return false;
  return (
    grp.showBorder !== undefined ||
    grp.borderColor !== undefined ||
    grp.borderWidth !== undefined ||
    grp.borderStyle !== undefined ||
    grp.borderSides !== undefined
  );
}

export function displayBorderForCell(
  c: EditorGridCell,
  g: EditorGridStyle,
  grp?: EditorGroupStyle,
): { width: number; color: string; dash?: number[] } {
  const explicit = hasExplicitBorderOverride(c) || hasExplicitGroupBorderOverride(grp);
  if (explicit) return borderForCell(c, g, grp);
  return { width: DEFAULT_BORDER_WIDTH, color: DEFAULT_BORDER_COLOR };
}

export const DEFAULT_BORDER_SIDES: BorderSides = {
  top: true,
  right: true,
  bottom: true,
  left: true,
};

/** 셀 오버라이드 → 그룹 → 전역 → 기본(사면) */
export function effectiveBorderSides(c: EditorGridCell, g: EditorGridStyle, grp?: EditorGroupStyle): BorderSides {
  return c.borderSides ?? grp?.borderSides ?? g.borderSides ?? DEFAULT_BORDER_SIDES;
}

export function cellWantsAnyBorderEdge(c: EditorGridCell, g: EditorGridStyle, grp?: EditorGroupStyle): boolean {
  const b = borderForCell(c, g, grp);
  if (b.width <= 0 || b.color === "transparent") return false;
  const s = effectiveBorderSides(c, g, grp);
  return s.top || s.right || s.bottom || s.left;
}

export function cellWantsBorderEdge(
  c: EditorGridCell,
  g: EditorGridStyle,
  edge: keyof BorderSides,
  grp?: EditorGroupStyle,
): boolean {
  const b = borderForCell(c, g, grp);
  if (b.width <= 0 || b.color === "transparent") return false;
  return effectiveBorderSides(c, g, grp)[edge];
}

export function cellShowsXDecoration(c: EditorGridCell, grp?: EditorGroupStyle): boolean {
  const d = c.cellDecoration ?? grp?.cellDecoration ?? "none";
  return d === "x";
}

export function fillForCell(c: EditorGridCell, g: EditorGridStyle, grp?: EditorGroupStyle): string {
  const raw = c.cellFill ?? grp?.cellFill ?? g.cellFill;
  return normalizeColorHex(raw, normalizeColorHex(g.cellFill, "#ffffff"));
}

/** 셀 또는 그룹 스타일에서 칸 배경색을 직접 지정했는지(전역 `cellFill`만 쓰는 경우는 false) */
export function hasExplicitCellFillOverride(c: EditorGridCell, grp?: EditorGroupStyle): boolean {
  return c.cellFill !== undefined || grp?.cellFill !== undefined;
}

/**
 * 편집기「기본 장식 숨김」용: 전역 기본 배경만 쓰는 칸은 투명, 셀·그룹에서 지정한 배경은 그대로.
 */
export function editorRectFillForCell(
  c: EditorGridCell,
  g: EditorGridStyle,
  grp: EditorGroupStyle | undefined,
  hideDefaultChrome: boolean,
): string {
  if (hideDefaultChrome && !hasExplicitCellFillOverride(c, grp)) {
    return "rgba(0,0,0,0)";
  }
  return fillForCell(c, g, grp);
}

/** 칸/그룹/전역 글자색(텍스트 fill) */
export function textColorForCell(c: EditorGridCell, g: EditorGridStyle, grp?: EditorGroupStyle): string {
  const raw = c.textColor ?? grp?.textColor ?? g.fontColor;
  return normalizeColorHex(raw, normalizeColorHex(g.fontColor, "#0f172a"));
}

/** 선택 칸 위에 얹는 틴트(테두리 stroke와 겹치지 않음) */
export const SELECTION_OVERLAY_FILL = "rgba(59, 130, 246, 0.12)";
