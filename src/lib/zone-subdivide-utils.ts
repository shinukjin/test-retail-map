/** 구획 세분화 — 도면(shelf) · 격자(cell) 공통 */

export type SubdivideEntry = {
  rowIndex: number;
  colIndex: number;
  /** 하위 구역 코드 (sectionCode / groupCode) */
  code: string;
  /** 표시 이름 (label / cellName) */
  label: string;
  /** 매대 코드 (bayCode / shelfCode) — 부모 접미사 복제 */
  bayCode: string;
};

export type SubdivideParentMeta = {
  code: string;
  label: string;
  bayCode: string;
};

/** 정수 구간을 N등분 (나머지는 앞쪽 청크에 +1) */
export function partitionTotal(total: number, parts: number): number[] {
  if (parts <= 0 || total <= 0) return [];
  const base = Math.floor(total / parts);
  const rem = total % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < rem ? 1 : 0));
}

/** 0 → A, 1 → B, … 25 → Z, 26 → AA */
export function suffixForIndex(index: number): string {
  let n = index;
  let result = "";
  do {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}

export function withCodeSuffix(base: string, suffix: string, separator = "-"): string {
  const trimmed = base.trim();
  if (!trimmed) return suffix;
  return `${trimmed}${separator}${suffix}`;
}

export function buildDefaultSubdivideEntries(
  subdivCols: number,
  subdivRows: number,
  parent: SubdivideParentMeta,
): SubdivideEntry[] {
  const entries: SubdivideEntry[] = [];
  let idx = 0;
  for (let r = 0; r < subdivRows; r++) {
    for (let c = 0; c < subdivCols; c++) {
      const suffix = suffixForIndex(idx);
      const codeBase = parent.code.trim() || "Z";
      const labelBase = parent.label.trim();
      const bayBase = parent.bayCode.trim();
      entries.push({
        rowIndex: r,
        colIndex: c,
        code: withCodeSuffix(codeBase, suffix),
        label: labelBase ? withCodeSuffix(labelBase, suffix) : suffix,
        bayCode: bayBase ? withCodeSuffix(bayBase, suffix) : "",
      });
      idx += 1;
    }
  }
  return entries;
}

export function entryAt(entries: SubdivideEntry[], rowIndex: number, colIndex: number): SubdivideEntry | undefined {
  return entries.find((e) => e.rowIndex === rowIndex && e.colIndex === colIndex);
}

export function validateSubdivideCounts(
  spanCols: number,
  spanRows: number,
  subdivCols: number,
  subdivRows: number,
): string | null {
  if (subdivCols < 1 || subdivRows < 1) return "분할 수는 1 이상이어야 합니다.";
  if (subdivCols > spanCols || subdivRows > spanRows) {
    return "분할 수가 구획 크기보다 클 수 없습니다.";
  }
  if (spanCols === 1 && spanRows === 1 && subdivCols === 1 && subdivRows === 1) {
    return "이미 1×1 구획입니다.";
  }
  return null;
}
