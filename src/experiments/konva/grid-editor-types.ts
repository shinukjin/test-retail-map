import type { TierIndex } from "@/domain/types";

export type TextAlignH = "left" | "center" | "right";
export type TextAlignV = "top" | "middle" | "bottom";

/** 셀·전역 테두리 선 종류 (Konva `dash` / Fabric `strokeDashArray`로 반영) */
export type BorderLineStyle = "solid" | "dashed" | "dotted";

export type CellDecoration = "none" | "x";

/** 테두리를 그릴 변(미지정이면 전역·셀에서 사면 모두 true로 간주) */
export type BorderSides = {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
};

/** 그리드 전체 기본 스타일 */
export type EditorGridStyle = {
  cellWidth: number;
  cellHeight: number;
  fontSize: number;
  fontColor: string;
  cellFill: string;
  /** false면 테두리 안 그림(선택 시 강조선만) */
  showBorder: boolean;
  borderColor: string;
  borderWidth: number;
  borderStyle: BorderLineStyle;
  /** 미지정이면 상·하·좌·우 모두 그림 */
  borderSides?: BorderSides;
};

/** 동일 `groupCode` 칸에 공통 적용(전역보다 우선, 셀 단독 설정보다 후순위) */
export type EditorGroupStyle = {
  fontSize?: number;
  cellFill?: string;
  textColor?: string;
  showBorder?: boolean;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: BorderLineStyle;
  borderSides?: BorderSides;
  cellDecoration?: CellDecoration;
  alignH?: TextAlignH;
  alignV?: TextAlignV;
};

export type EditorGridCell = {
  row: number;
  col: number;
  shelfCode: string;
  tier: TierIndex | null;
  cellName: string;
  /** 사용자 지정 그룹(구역·묶음 등). 빈 문자열이면 미지정 */
  groupCode: string;
  colspan: number;
  rowspan: number;
  /** 병합에 포함된 칸이면 시작 칸 키 `"row-col"` */
  mergedInto: string | null;
  /** 아래 필드가 있으면 전역 스타일 대신 사용 */
  fontSize?: number;
  cellFill?: string;
  textColor?: string;
  showBorder?: boolean;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: BorderLineStyle;
  /** 미지정이면 전역 `borderSides` 또는 사면 전체 */
  borderSides?: BorderSides;
  /** `x`: 셀 안 대각선 표시 */
  cellDecoration?: CellDecoration;
  alignH?: TextAlignH;
  alignV?: TextAlignV;
};

export function editorCellKey(row: number, col: number): string {
  return `${row}-${col}`;
}

export function defaultEditorGridStyle(): EditorGridStyle {
  return {
    cellWidth: 48,
    cellHeight: 48,
    fontSize: 12,
    fontColor: "#0f172a",
    cellFill: "#ffffff",
    showBorder: false,
    borderColor: "#94a3b8",
    borderWidth: 0,
    borderStyle: "solid",
  };
}

/** 스타일 병합용 더미 앵커(row/col 미사용) */
export const EMPTY_GRID_ANCHOR: EditorGridCell = {
  row: 0,
  col: 0,
  shelfCode: "",
  tier: null,
  cellName: "",
  groupCode: "",
  colspan: 1,
  rowspan: 1,
  mergedInto: null,
};
