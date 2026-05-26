"use client";

import { useRef, type ChangeEvent } from "react";
import type { GridEditorModel } from "@/experiments/grid-editor/useGridEditorModel";

const btnLine =
  "inline-flex items-center justify-center gap-0.5 rounded-md border border-zinc-300 bg-white px-2 py-1 text-[10px] font-medium text-zinc-700 shadow-sm transition hover:border-zinc-400 hover:bg-zinc-50 active:scale-[0.98] dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-500 dark:hover:bg-zinc-800";
const btnPrimary =
  "inline-flex items-center justify-center gap-0.5 rounded-md bg-zinc-900 px-2 py-1 text-[10px] font-medium text-white shadow-sm transition hover:bg-zinc-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white";

type Props = { model: GridEditorModel };

export function KonvaGridPersistControls({ model }: Props) {
  const {
    hasGrid,
    saveGridJson,
    loadFromLocalStorage,
    loadFromAlternateLocalStorage,
    importGridFromJsonString,
    alternateStorageImportKey,
  } = model;

  const importFileRef = useRef<HTMLInputElement>(null);

  const onImportJsonFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      importGridFromJsonString(String(reader.result ?? ""));
    };
    reader.readAsText(f, "UTF-8");
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
      <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">도면</span>
      <button type="button" onClick={saveGridJson} disabled={!hasGrid} className={btnPrimary}>
        저장
      </button>
      <button type="button" onClick={loadFromLocalStorage} className={btnLine}>
        저장 불러오기
      </button>
      {alternateStorageImportKey ? (
        <button
          type="button"
          onClick={loadFromAlternateLocalStorage}
          className={btnLine}
          title="다른 편집기에서 localStorage로 저장한 마지막 그리드"
        >
          다른 편집기
        </button>
      ) : null}
      <input
        ref={importFileRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-label="JSON 파일에서 그리드 불러오기"
        onChange={onImportJsonFile}
      />
      <button type="button" onClick={() => importFileRef.current?.click()} className={btnLine}>
        JSON 파일…
      </button>
    </div>
  );
}
