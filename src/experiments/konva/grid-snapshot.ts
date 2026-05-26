import type { TierIndex } from "@/domain/types";
import type {
  BorderLineStyle,
  BorderSides,
  CellDecoration,
  EditorGridCell,
  EditorGridStyle,
  EditorGroupStyle,
  TextAlignH,
  TextAlignV,
} from "./grid-editor-types";
import { defaultEditorGridStyle, editorCellKey } from "./grid-editor-types";
import { normalizeColorHex } from "./grid-editor-cell-draw";

/** 편집기 저장본 — localStorage + JSON 파일과 동일 스키마 */
export type EditorGridSnapshot = {
  cols: number;
  rows: number;
  gridStyle: EditorGridStyle;
  cells: EditorGridCell[];
  /** `groupCode.trim()` 키 — 비어 있으면 생략 가능 */
  groupStyles?: Record<string, EditorGroupStyle>;
};

export const KONVA_GRID_SNAPSHOT_STORAGE_KEY = "retail-konva-grid-snapshot-v1";

export const FABRIC_GRID_SNAPSHOT_STORAGE_KEY = "retail-fabric-grid-snapshot-v1";

export function notifyFabricGridSnapshotChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("retail-fabric-grid-snapshot-changed"));
}

const ALIGN_H: TextAlignH[] = ["left", "center", "right"];
const ALIGN_V: TextAlignV[] = ["top", "middle", "bottom"];
const BORDER_STYLES: BorderLineStyle[] = ["solid", "dashed", "dotted"];
const CELL_DECORATIONS: CellDecoration[] = ["none", "x"];

function parseCellDecoration(v: unknown): CellDecoration | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v !== "string") return undefined;
  return CELL_DECORATIONS.includes(v as CellDecoration) ? (v as CellDecoration) : undefined;
}

function parseBorderSides(raw: unknown): BorderSides | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const bit = (k: string): boolean | undefined =>
    typeof o[k] === "boolean" ? (o[k] as boolean) : undefined;
  const t = bit("top");
  const r = bit("right");
  const b = bit("bottom");
  const l = bit("left");
  if (t === undefined && r === undefined && b === undefined && l === undefined) return undefined;
  return {
    top: t ?? true,
    right: r ?? true,
    bottom: b ?? true,
    left: l ?? true,
  };
}

function parseTier(v: unknown): TierIndex | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return null;
}

function parseAlignH(v: unknown): TextAlignH | undefined {
  if (typeof v !== "string") return undefined;
  return ALIGN_H.includes(v as TextAlignH) ? (v as TextAlignH) : undefined;
}

function parseAlignV(v: unknown): TextAlignV | undefined {
  if (typeof v !== "string") return undefined;
  return ALIGN_V.includes(v as TextAlignV) ? (v as TextAlignV) : undefined;
}

function parseGridStyle(raw: unknown): EditorGridStyle {
  const d = defaultEditorGridStyle();
  if (!raw || typeof raw !== "object") return d;
  const o = raw as Record<string, unknown>;
  const num = (k: string, def: number, lo: number, hi: number) => {
    const n = Number(o[k]);
    if (!Number.isFinite(n)) return def;
    return Math.min(hi, Math.max(lo, n));
  };
  const str = (k: string, def: string) => (typeof o[k] === "string" ? (o[k] as string) : def);
  const base: EditorGridStyle = {
    cellWidth: num("cellWidth", d.cellWidth, 0, 240),
    cellHeight: num("cellHeight", d.cellHeight, 0, 240),
    fontSize: num("fontSize", d.fontSize, 0, 48),
    fontColor: normalizeColorHex(str("fontColor", d.fontColor), "#0f172a"),
    cellFill: normalizeColorHex(str("cellFill", d.cellFill), "#ffffff"),
    showBorder: false,
    borderColor: d.borderColor,
    borderWidth: 0,
    borderStyle: d.borderStyle,
  };
  return base;
}

function parseCell(raw: unknown, cols: number, rows: number): EditorGridCell | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const row = Math.floor(Number(o.row));
  const col = Math.floor(Number(o.col));
  if (!Number.isFinite(row) || !Number.isFinite(col) || row < 0 || col < 0 || row >= rows || col >= cols) {
    return null;
  }
  const colspan = Math.max(1, Math.floor(Number(o.colspan)) || 1);
  const rowspan = Math.max(1, Math.floor(Number(o.rowspan)) || 1);
  let mergedInto: string | null = null;
  if (o.mergedInto != null && o.mergedInto !== "") {
    if (typeof o.mergedInto === "string") mergedInto = o.mergedInto;
    else return null;
  }
  const shelfCode = typeof o.shelfCode === "string" ? o.shelfCode : "";
  const cellName = typeof o.cellName === "string" ? o.cellName : "";
  const groupCode =
    typeof o.groupCode === "string" ? o.groupCode.slice(0, 40) : "";
  const tier = parseTier(o.tier);

  const cell: EditorGridCell = {
    row,
    col,
    shelfCode,
    tier,
    cellName,
    groupCode,
    colspan,
    rowspan,
    mergedInto,
  };
  Object.assign(cell, parseVisualStyleFields(o));
  return cell;
}

/** 칸·그룹 공통 스타일 오버라이드 필드 파싱 */
function parseVisualStyleFields(o: Record<string, unknown>): EditorGroupStyle {
  const out: EditorGroupStyle = {};
  if (typeof o.fontSize === "number" && Number.isFinite(o.fontSize)) out.fontSize = o.fontSize;
  if (typeof o.cellFill === "string") out.cellFill = normalizeColorHex(o.cellFill, "#ffffff");
  if (typeof o.textColor === "string") out.textColor = normalizeColorHex(o.textColor, "#0f172a");
  if (typeof o.showBorder === "boolean") out.showBorder = o.showBorder;
  if (typeof o.borderColor === "string") out.borderColor = normalizeColorHex(o.borderColor, "#94a3b8");
  if (typeof o.borderWidth === "number" && Number.isFinite(o.borderWidth)) out.borderWidth = o.borderWidth;
  const ah = parseAlignH(o.alignH);
  const av = parseAlignV(o.alignV);
  if (ah) out.alignH = ah;
  if (av) out.alignV = av;
  if (typeof o.borderStyle === "string" && BORDER_STYLES.includes(o.borderStyle as BorderLineStyle)) {
    out.borderStyle = o.borderStyle as BorderLineStyle;
  }
  const bsCell = parseBorderSides(o.borderSides);
  if (bsCell) out.borderSides = bsCell;
  const dec = parseCellDecoration(o.cellDecoration);
  if (dec === "x") out.cellDecoration = "x";
  return out;
}

/** JSON 객체에서 스냅샷 복원. 실패 시 null. */
export function parseEditorGridSnapshot(raw: unknown): EditorGridSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const cols = Math.floor(Number(o.cols));
  const rows = Math.floor(Number(o.rows));
  if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols < 1 || rows < 1) return null;
  const gridStyle = parseGridStyle(o.gridStyle);
  if (!Array.isArray(o.cells)) return null;
  const cells: EditorGridCell[] = [];
  for (const item of o.cells) {
    const c = parseCell(item, cols, rows);
    if (!c) return null;
    cells.push(c);
  }
  if (cells.length !== cols * rows) return null;
  const seen = new Set<string>();
  for (const c of cells) {
    const k = editorCellKey(c.row, c.col);
    if (seen.has(k)) return null;
    seen.add(k);
  }
  if (seen.size !== cols * rows) return null;

  let groupStyles: Record<string, EditorGroupStyle> | undefined;
  if (o.groupStyles !== undefined && o.groupStyles !== null && typeof o.groupStyles === "object") {
    const acc: Record<string, EditorGroupStyle> = {};
    for (const [rawKey, val] of Object.entries(o.groupStyles as Record<string, unknown>)) {
      const key = typeof rawKey === "string" ? rawKey.trim().slice(0, 40) : "";
      if (!key || val == null || typeof val !== "object") continue;
      const layer = parseVisualStyleFields(val as Record<string, unknown>);
      if (Object.keys(layer).length > 0) acc[key] = layer;
    }
    if (Object.keys(acc).length > 0) groupStyles = acc;
  }

  return { cols, rows, gridStyle, cells, ...(groupStyles ? { groupStyles } : {}) };
}

export function snapshotToJsonString(s: EditorGridSnapshot): string {
  return JSON.stringify(s, null, 2);
}

export function notifyKonvaGridSnapshotChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("retail-konva-grid-snapshot-changed"));
}
