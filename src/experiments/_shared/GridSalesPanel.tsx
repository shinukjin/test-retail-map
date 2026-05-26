"use client";

import { useState } from "react";
import type { EditorGridCell } from "@/experiments/konva/grid-editor-types";
import type { ShelfSales, TierIndex } from "@/domain/types";
import { TIER_INDICES } from "@/domain/constants";
import { getSalesForShelfCode, normalizeShelfCode } from "@/lib/grid-sales-api";

const money = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

function TierSalesButtons({
  cell,
  row,
}: {
  cell: EditorGridCell;
  row: ShelfSales | undefined;
}) {
  const [peekTier, setPeekTier] = useState<TierIndex | null>(cell.tier ?? null);

  return (
    <>
      <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">단별 (1~4단)</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {TIER_INDICES.map((tier) => {
          const active = peekTier === tier;
          const amt = row?.byTier[tier] ?? 0;
          return (
            <button
              key={tier}
              type="button"
              onClick={() => setPeekTier(active ? null : tier)}
              className={`rounded-lg border px-2 py-1 text-xs font-medium transition ${
                active
                  ? "border-blue-600 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-100"
                  : "border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              }`}
            >
              {tier}단 {money.format(amt)}
            </button>
          );
        })}
      </div>
      {peekTier != null && (
        <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-200">
          보기 기준: <span className="font-medium">{peekTier}단</span> ·{" "}
          <span className="tabular-nums">{money.format(row?.byTier[peekTier] ?? 0)}</span>
        </p>
      )}
    </>
  );
}

export function GridSalesPanel({
  cell,
  salesByShelfCode,
}: {
  cell: EditorGridCell | null;
  salesByShelfCode: Record<string, ShelfSales>;
}) {
  const codeRaw = cell?.shelfCode ?? "";
  const codeNorm = normalizeShelfCode(codeRaw);
  const row = codeNorm ? getSalesForShelfCode(salesByShelfCode, codeNorm) : undefined;
  const total = row?.total ?? 0;

  return (
    <aside className="w-full shrink-0 space-y-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 lg:w-80 lg:self-stretch">
      <div>
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">매출 내역</h2>
        {!cell && (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            그리드에서 칸을 선택하면, 해당 칸의 매대 코드·단 기준으로 표시됩니다.
          </p>
        )}
        {cell && (
          <div className="mt-2 space-y-1 text-sm text-zinc-800 dark:text-zinc-100">
            <p className="text-xs text-zinc-500">
              열 {cell.col + 1} · 행 {cell.row + 1}
              {cell.cellName ? ` · ${cell.cellName}` : ""}
            </p>
            <p className="text-lg font-semibold tabular-nums">{money.format(total)}</p>
            <p className="text-xs text-zinc-500">
              매대 코드: <span className="font-mono text-zinc-700 dark:text-zinc-300">{codeNorm || "—"}</span>
            </p>
            <p className="text-xs text-zinc-500">
              칸에 지정된 단:{" "}
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                {cell.tier != null ? `${cell.tier}단` : "없음"}
              </span>
            </p>
            {!codeNorm && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                매대 코드가 비어 있어 POS 연동 금액은 0으로 표시됩니다.
              </p>
            )}
          </div>
        )}
      </div>

      <div>
        {cell ? (
          <TierSalesButtons
            key={`${cell.row}-${cell.col}-${cell.shelfCode}-${cell.tier ?? "x"}`}
            cell={cell}
            row={row}
          />
        ) : (
          <>
            <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">단별 (1~4단)</h3>
            <p className="mt-2 text-xs text-zinc-500">칸을 선택하면 단별 금액이 표시됩니다.</p>
          </>
        )}
      </div>
    </aside>
  );
}
