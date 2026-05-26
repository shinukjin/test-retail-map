"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import type { EditorGridCell } from "./grid-editor-types";
import { editorCellKey } from "./grid-editor-types";
import { PAD } from "./grid-editor-cell-draw";
import { resolveAnchorCell } from "@/experiments/grid-editor/grid-inquiry-utils";
import { GridSnapshotWorldStage } from "./GridSnapshotWorldStage";
import {
  KONVA_GRID_SNAPSHOT_STORAGE_KEY,
  parseEditorGridSnapshot,
  type EditorGridSnapshot,
} from "./grid-snapshot";

export default function GridSnapshotViewer({
  onSelectionChange,
}: {
  onSelectionChange?: (cell: EditorGridCell | null) => void;
}) {
  const [snapshot, setSnapshot] = useState<EditorGridSnapshot | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const cellsMap = useMemo(() => {
    if (!snapshot) return new Map<string, EditorGridCell>();
    const m = new Map<string, EditorGridCell>();
    for (const c of snapshot.cells) {
      m.set(editorCellKey(c.row, c.col), c);
    }
    return m;
  }, [snapshot]);

  const load = useCallback(() => {
    if (typeof window === "undefined") return;
    setSelectedKey(null);
    onSelectionChange?.(null);
    const raw = localStorage.getItem(KONVA_GRID_SNAPSHOT_STORAGE_KEY);
    if (!raw) {
      setSnapshot(null);
      setParseError(null);
      return;
    }
    try {
      const parsed = parseEditorGridSnapshot(JSON.parse(raw));
      setSnapshot(parsed);
      setParseError(parsed ? null : "저장된 JSON이 스키마와 맞지 않습니다.");
    } catch {
      setSnapshot(null);
      setParseError("저장본 JSON을 파싱할 수 없습니다.");
    }
  }, [onSelectionChange]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      load();
    }, 0);
    window.addEventListener("storage", load);
    window.addEventListener("retail-konva-grid-snapshot-changed", load);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("storage", load);
      window.removeEventListener("retail-konva-grid-snapshot-changed", load);
    };
  }, [load]);

  const pickCell = useCallback(
    (key: string) => {
      setSelectedKey(key);
      const anchor = resolveAnchorCell(cellsMap, key);
      onSelectionChange?.(anchor);
    },
    [cellsMap, onSelectionChange],
  );

  const clearSelection = useCallback(() => {
    setSelectedKey(null);
    onSelectionChange?.(null);
  }, [onSelectionChange]);

  const onPickFile = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = parseEditorGridSnapshot(JSON.parse(String(reader.result)));
          if (!parsed) {
            setParseError("선택한 파일이 올바른 그리드 저장본이 아닙니다.");
            return;
          }
          localStorage.setItem(KONVA_GRID_SNAPSHOT_STORAGE_KEY, JSON.stringify(parsed));
          setSnapshot(parsed);
          setParseError(null);
          clearSelection();
        } catch {
          setParseError("파일을 읽는 중 오류가 났습니다.");
        }
      };
      reader.readAsText(file, "utf-8");
    },
    [clearSelection],
  );

  const cw = snapshot?.gridStyle.cellWidth ?? 0;
  const ch = snapshot?.gridStyle.cellHeight ?? 0;
  const cols = snapshot?.cols ?? 0;
  const rows = snapshot?.rows ?? 0;
  const worldW = useMemo(
    () => (snapshot ? PAD * 2 + cols * cw : 400),
    [snapshot, cols, cw],
  );
  const worldH = useMemo(
    () => (snapshot ? PAD * 2 + rows * ch : 200),
    [snapshot, rows, ch],
  );

  return (
    <section className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">저장된 그리드</h2>
        <label className="cursor-pointer rounded border border-zinc-300 px-2 py-1 text-[11px] dark:border-zinc-600">
          JSON 파일 불러오기
          <input type="file" accept="application/json,.json" className="hidden" onChange={onPickFile} />
        </label>
      </div>
      <div className="mt-2 flex shrink-0 flex-wrap items-center gap-2">
        <p className="text-[10px] text-zinc-500">
          휠: 확대·축소 · 끌면 화면 이동, 짧게 누르면 칸 선택 · 아래 박스 안만 반응 · 칸 이름으로 표시
        </p>
      </div>
      {parseError && <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">{parseError}</p>}
      {!snapshot && !parseError && (
        <p className="mt-3 text-xs text-zinc-500">아직 저장된 그리드가 없습니다. 편집기에서 생성 후 저장하세요.</p>
      )}
      {snapshot && (
        <GridSnapshotWorldStage
          key={`${snapshot.cols}x${snapshot.rows}-${snapshot.cells.length}`}
          snapshot={snapshot}
          worldW={worldW}
          worldH={worldH}
          cw={cw}
          ch={ch}
          selectedKey={selectedKey}
          onPickCell={pickCell}
          onClearSelection={clearSelection}
        />
      )}
    </section>
  );
}
