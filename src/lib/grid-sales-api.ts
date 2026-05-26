import type { ShelfSales, TierIndex } from "@/domain/types";
import raw from "@/data/fixtures/sales-by-shelf-code.json";

type RawRow = { total: number; byTier: Record<string, number> };

function normalizeByTier(by: Record<string, number>): ShelfSales["byTier"] {
  const out: ShelfSales["byTier"] = {};
  for (const [k, v] of Object.entries(by)) {
    const n = Number(k);
    if (n >= 1 && n <= 4) out[n as TierIndex] = v;
  }
  return out;
}

/** 브라우저·빌드 공통: 매대 코드(문자열) → 단별 매출 표 */
export function loadSalesByShelfCode(): Record<string, ShelfSales> {
  const table = raw as Record<string, RawRow>;
  const out: Record<string, ShelfSales> = {};
  for (const [k, v] of Object.entries(table)) {
    out[k.trim().toUpperCase()] = {
      total: v.total,
      byTier: normalizeByTier(v.byTier ?? {}),
    };
  }
  return out;
}

export function normalizeShelfCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function getSalesForShelfCode(
  table: Record<string, ShelfSales>,
  shelfCode: string,
): ShelfSales | undefined {
  const k = normalizeShelfCode(shelfCode);
  if (!k) return undefined;
  return table[k];
}
