"use client";

import { useMemo, useState } from "react";
import {
  buildDefaultSubdivideEntries,
  type SubdivideEntry,
  type SubdivideParentMeta,
} from "@/lib/zone-subdivide-utils";

const inSm =
  "h-6 w-full rounded border border-zinc-300 bg-white px-1 py-0.5 text-[10px] leading-tight shadow-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-400/35 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50";
const btnSolid =
  "inline-flex items-center justify-center rounded-md bg-zinc-900 px-2 py-1 text-[10px] font-medium text-white shadow-sm transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white";
const btnLine =
  "inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-2 py-1 text-[10px] text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";

type Props = {
  title?: string;
  parent: SubdivideParentMeta;
  spanCols: number;
  spanRows: number;
  onApply: (subdivCols: number, subdivRows: number, entries: SubdivideEntry[]) => void;
  disabled?: boolean;
  /** false면 도면 bbox처럼 span 제한 없이 분할 (기본 true) */
  enforceSpanLimit?: boolean;
  maxSubdivCols?: number;
  maxSubdivRows?: number;
  /** 코드/이름/매대 필드 라벨 커스터마이즈 */
  labels?: { code: string; label: string; bay: string };
};

export function ZoneSubdivideForm({
  title = "구획 세분화",
  parent,
  spanCols,
  spanRows,
  onApply,
  disabled = false,
  enforceSpanLimit = true,
  maxSubdivCols,
  maxSubdivRows,
  labels = { code: "하위 구역 코드", label: "칸 이름", bay: "매대 코드" },
}: Props) {
  const [subdivColsIn, setSubdivColsIn] = useState("2");
  const [subdivRowsIn, setSubdivRowsIn] = useState("2");
  const [customEntries, setCustomEntries] = useState<SubdivideEntry[] | null>(null);
  const [customFormKey, setCustomFormKey] = useState("");

  const subdivCols = Math.max(1, Math.floor(Number(subdivColsIn)) || 1);
  const subdivRows = Math.max(1, Math.floor(Number(subdivRowsIn)) || 1);
  const colMax = maxSubdivCols ?? spanCols;
  const rowMax = maxSubdivRows ?? spanRows;

  const parentKey = `${parent.code}|${parent.label}|${parent.bayCode}`;
  const formKey = `${parentKey}|${subdivCols}x${subdivRows}`;

  const defaultEntries = useMemo(
    () => buildDefaultSubdivideEntries(subdivCols, subdivRows, parent),
    [parent, subdivCols, subdivRows],
  );

  const entries = customFormKey === formKey && customEntries ? customEntries : defaultEntries;

  const canSubdivide = useMemo(() => {
    if (disabled) return false;
    if (subdivCols === 1 && subdivRows === 1) return false;
    if (enforceSpanLimit) {
      if (subdivCols > spanCols || subdivRows > spanRows) return false;
      if (spanCols === 1 && spanRows === 1) return false;
    } else {
      if (subdivCols > colMax || subdivRows > rowMax) return false;
    }
    return entries.length > 0 && entries.every((e) => e.code.trim().length > 0);
  }, [disabled, subdivCols, subdivRows, spanCols, spanRows, enforceSpanLimit, colMax, rowMax, entries]);

  const updateEntry = (index: number, patch: Partial<SubdivideEntry>) => {
    setCustomFormKey(formKey);
    setCustomEntries((prev) => {
      const base = customFormKey === formKey && prev ? prev : defaultEntries;
      return base.map((e, i) => (i === index ? { ...e, ...patch } : e));
    });
  };

  const resetDefaults = () => {
    setCustomFormKey("");
    setCustomEntries(null);
  };

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-2 dark:border-violet-900/50 dark:bg-violet-950/20">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
        {title}
      </p>
      <p className="mt-0.5 text-[9px] leading-snug text-zinc-500">
        {enforceSpanLimit
          ? `상위 ${parent.code.trim() || "—"} · ${spanCols}×${spanRows} 구획을 나눕니다.`
          : `상위 ${parent.code.trim() || "—"} · 영역을 세부 구획으로 나눕니다.`}{" "}
        하위 코드는 수정 후 적용하세요.
      </p>

      <div className="mt-1.5 grid grid-cols-2 gap-1">
        <label className="flex flex-col gap-px text-[9px] text-zinc-500">
          가로 분할
          <input
            type="number"
            min={1}
            max={enforceSpanLimit ? spanCols : colMax}
            value={subdivColsIn}
            onChange={(e) => setSubdivColsIn(e.target.value)}
            className={inSm}
          />
        </label>
        <label className="flex flex-col gap-px text-[9px] text-zinc-500">
          세로 분할
          <input
            type="number"
            min={1}
            max={enforceSpanLimit ? spanRows : rowMax}
            value={subdivRowsIn}
            onChange={(e) => setSubdivRowsIn(e.target.value)}
            className={inSm}
          />
        </label>
      </div>

      <div className="mt-1.5 max-h-40 space-y-1 overflow-y-auto">
        {entries.map((entry, i) => (
          <div
            key={`${entry.rowIndex}-${entry.colIndex}`}
            className="rounded border border-zinc-200 bg-white/80 p-1 dark:border-zinc-700 dark:bg-zinc-900/60"
          >
            <p className="mb-0.5 text-[8px] font-medium text-zinc-400">
              #{i + 1} · 행{entry.rowIndex + 1} 열{entry.colIndex + 1}
            </p>
            <div className="grid grid-cols-1 gap-0.5">
              <label className="flex flex-col gap-px text-[8px] text-zinc-500">
                {labels.code}
                <input
                  value={entry.code}
                  maxLength={40}
                  onChange={(e) => updateEntry(i, { code: e.target.value.slice(0, 40) })}
                  className={inSm}
                />
              </label>
              <label className="flex flex-col gap-px text-[8px] text-zinc-500">
                {labels.label}
                <input
                  value={entry.label}
                  onChange={(e) => updateEntry(i, { label: e.target.value })}
                  className={inSm}
                />
              </label>
              <label className="flex flex-col gap-px text-[8px] text-zinc-500">
                {labels.bay}
                <input
                  value={entry.bayCode}
                  onChange={(e) => updateEntry(i, { bayCode: e.target.value })}
                  className={inSm}
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1">
        <button type="button" onClick={resetDefaults} className={btnLine}>
          기본값
        </button>
        <button
          type="button"
          disabled={!canSubdivide}
          onClick={() => onApply(subdivCols, subdivRows, entries)}
          className={btnSolid}
        >
          세분화 적용
        </button>
      </div>
    </div>
  );
}
