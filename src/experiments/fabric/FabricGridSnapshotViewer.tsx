"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import type { EditorGridCell } from "@/experiments/konva/grid-editor-types";
import { editorCellKey } from "@/experiments/konva/grid-editor-types";
import { PAD } from "@/experiments/konva/grid-editor-cell-draw";
import { resolveAnchorCell } from "@/experiments/grid-editor/grid-inquiry-utils";
import type { GridSelectOptions } from "@/experiments/grid-editor/useGridEditorModel";
import {
  FABRIC_GRID_SNAPSHOT_STORAGE_KEY,
  parseEditorGridSnapshot,
  type EditorGridSnapshot,
} from "@/experiments/konva/grid-snapshot";
import { FabricGridCanvas } from "./FabricGridCanvas";

export default function FabricGridSnapshotViewer({
  onSelectionChange,
}: {
  onSelectionChange?: (cell: EditorGridCell | null) => void;
}) {
  const [snapshot, setSnapshot] = useState<EditorGridSnapshot | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  const load = useCallback(() => {
    if (typeof window === "undefined") return;
    setSelectedKeys([]);
    onSelectionChange?.(null);
    const raw = localStorage.getItem(FABRIC_GRID_SNAPSHOT_STORAGE_KEY);
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
    window.addEventListener("retail-fabric-grid-snapshot-changed", load);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("storage", load);
      window.removeEventListener("retail-fabric-grid-snapshot-changed", load);
    };
  }, [load]);

  const cellsMap = useMemo(() => {
    if (!snapshot) return new Map<string, EditorGridCell>();
    const m = new Map<string, EditorGridCell>();
    for (const c of snapshot.cells) {
      m.set(editorCellKey(c.row, c.col), c);
    }
    return m;
  }, [snapshot]);

  const selectCell = useCallback(
    (key: string | null, snapshotArg?: Map<string, EditorGridCell>, _opts?: GridSelectOptions) => {
      void _opts;
      const snap = snapshotArg ?? cellsMap;
      if (!key) {
        setSelectedKeys([]);
        onSelectionChange?.(null);
        return;
      }
      setSelectedKeys([key]);
      onSelectionChange?.(resolveAnchorCell(snap, key));
    },
    [cellsMap, onSelectionChange],
  );

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
          localStorage.setItem(FABRIC_GRID_SNAPSHOT_STORAGE_KEY, JSON.stringify(parsed));
          setSnapshot(parsed);
          setParseError(null);
          setSelectedKeys([]);
          onSelectionChange?.(null);
        } catch {
          setParseError("파일을 읽는 중 오류가 났습니다.");
        }
      };
      reader.readAsText(file, "utf-8");
    },
    [onSelectionChange],
  );

  const stageW = snapshot ? PAD * 2 + snapshot.cols * snapshot.gridStyle.cellWidth : 400;
  const stageH = snapshot ? PAD * 2 + snapshot.rows * snapshot.gridStyle.cellHeight : 200;

  return (
    <section className="w-full min-w-0 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">저장된 그리드 (Fabric)</h2>
        <label className="cursor-pointer rounded border border-zinc-300 px-2 py-1 text-[11px] dark:border-zinc-600">
          JSON 파일 불러오기
          <input type="file" accept="application/json,.json" className="hidden" onChange={onPickFile} />
        </label>
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">
        Fabric 편집기 저장분이 표시됩니다. 칸을 클릭하면 오른쪽 매출이 갱신됩니다. (매대 코드 예: A1, C2, R1, NB1)
      </p>
      {parseError && <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">{parseError}</p>}
      {!snapshot && !parseError && (
        <p className="mt-3 text-xs text-zinc-500">아직 저장된 그리드가 없습니다. Fabric 편집기에서 생성 후 저장하세요.</p>
      )}
      {snapshot && (
        <div className="mt-3">
          <FabricGridCanvas
            interactive
            cellLabelMode="applied"
            hasGrid
            cols={snapshot.cols}
            rows={snapshot.rows}
            cells={cellsMap}
            gridStyle={snapshot.gridStyle}
            groupStyles={snapshot.groupStyles ?? {}}
            selectedKeys={selectedKeys}
            selectCell={selectCell}
            stageW={stageW}
            stageH={stageH}
          />
        </div>
      )}
    </section>
  );
}
