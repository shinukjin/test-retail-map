"use client";

import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { TIER_INDICES } from "@/domain/constants";
import {
  clamp,
  DEFAULT_BORDER_COLOR,
  DEFAULT_BORDER_WIDTH,
  DEFAULT_BORDER_SIDES,
} from "@/experiments/konva/grid-editor-cell-draw";
import type { BorderSides, EditorGridStyle } from "@/experiments/konva/grid-editor-types";
import type { GridEditorModel } from "./useGridEditorModel";
import { BORDER_PRESET_SIDES } from "./border-presets";
import { MAX_DIM, MIN_WH, MAX_WH } from "./constants";
import { solidAnchorRectangleForMerge } from "./grid-selection-utils";
import { normalizeUnsignedIntString, parseNonNegInt, sanitizePixelDigits } from "./input-utils";
import { SelectionStyleInspector } from "./SelectionStyleInspector";
import {
  BORDER_SWATCHES,
  BorderEdgePicker,
  ColorField,
  FILL_SWATCHES,
  LineStylePicker,
  TEXT_SWATCHES,
  ToggleRow,
  WidthSlider,
} from "./grid-style-controls";

/** 패널 전역: 작은 타이포 + 호버·포커스 피드백 */
const inSm =
  "h-6 w-full rounded border border-zinc-300 bg-white px-1 py-0.5 text-[10px] leading-tight tabular-nums shadow-sm outline-none transition-[border-color,box-shadow] hover:border-zinc-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-400/35 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-zinc-500";
const btnSolid =
  "inline-flex items-center justify-center gap-0.5 rounded-md bg-zinc-900 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm transition hover:bg-zinc-800 active:scale-[0.98] dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white";
const btnLine =
  "inline-flex items-center justify-center gap-0.5 rounded-md border border-zinc-300 bg-white px-1.5 py-0.5 text-[10px] text-zinc-700 shadow-sm transition hover:border-zinc-400 hover:bg-zinc-50 active:scale-[0.98] dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-500 dark:hover:bg-zinc-800";
const btnMini =
  "rounded border border-zinc-300 bg-white px-1 py-0.5 text-[9px] text-zinc-700 transition hover:bg-zinc-50 active:scale-[0.98] dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";

type Props = {
  model: GridEditorModel;
  /** true면 저장·불러오기 버튼을 숨김(외부 툴바에서 렌더) */
  hidePersistenceControls?: boolean;
};

/** 테두리가 꺼져 있으면 UI는 모두 해제로, 켜져 있으면 저장된 면(없으면 사면) */
function globalBorderSidesForDisplay(g: EditorGridStyle): BorderSides {
  if (!g.showBorder || g.borderWidth <= 0) {
    return { top: false, right: false, bottom: false, left: false };
  }
  return g.borderSides ?? DEFAULT_BORDER_SIDES;
}

const sideSectionBase =
  "rounded-md border border-zinc-200 p-1.5 dark:border-zinc-800";

function CollapsibleSideSection({
  title,
  open,
  onToggle,
  sectionClassName,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  /** 접힐 때는 `shrink-0`만, 펼칠 때 `min-h-0 flex-1` 등 레이아웃 보조 */
  sectionClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={sectionClassName ?? sideSectionBase}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-1 rounded-sm py-0.5 text-left outline-none ring-sky-400/40 transition hover:bg-zinc-50 focus-visible:ring-2 dark:hover:bg-zinc-900/80"
        aria-expanded={open}
      >
        <h2 className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">{title}</h2>
        <span className="shrink-0 text-[10px] leading-none text-zinc-400" aria-hidden>
          {open ? "▼" : "▶"}
        </span>
      </button>
      {open ? <div className="mt-1.5 space-y-1.5">{children}</div> : null}
    </section>
  );
}

function CollapsibleSubBlock({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1 border-t border-zinc-100 pt-1.5 dark:border-zinc-800">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-1 rounded-sm py-0.5 text-left outline-none ring-sky-400/40 transition hover:bg-zinc-50 focus-visible:ring-2 dark:hover:bg-zinc-900/80"
        aria-expanded={open}
      >
        <h3 className="text-[9px] font-medium text-zinc-500">{title}</h3>
        <span className="shrink-0 text-[10px] leading-none text-zinc-400" aria-hidden>
          {open ? "▼" : "▶"}
        </span>
      </button>
      {open ? <div className="space-y-1">{children}</div> : null}
    </div>
  );
}

function BulkGroupPanel({
  initialGroup,
  count,
  applyGroupToSelection,
  selectCell,
}: {
  initialGroup: string;
  count: number;
  applyGroupToSelection: (raw: string) => void;
  selectCell: GridEditorModel["selectCell"];
}) {
  const [groupBulkIn, setGroupBulkIn] = useState(initialGroup);
  return (
    <div className="mt-1.5 space-y-1.5 text-[10px] leading-snug">
      <p className="font-medium text-zinc-800 dark:text-zinc-100">{count}칸</p>
      <p className="text-[9px] text-zinc-500">⌘/Ctrl+클릭 다중 · Shift+클릭 범위 · 스타일은 위「선택 스타일」패널</p>
      <label className="flex flex-col gap-px">
        <span className="text-[9px] text-zinc-500">그룹</span>
        <input
          value={groupBulkIn}
          maxLength={40}
          placeholder="일괄 그룹"
          onChange={(e) => setGroupBulkIn(e.target.value.slice(0, 40))}
          className={inSm}
        />
      </label>
      <div className="flex flex-wrap gap-1">
        <button type="button" onClick={() => applyGroupToSelection(groupBulkIn)} className={btnSolid}>
          적용
        </button>
        <button type="button" onClick={() => selectCell(null)} className={btnLine}>
          해제
        </button>
      </div>
    </div>
  );
}

export function GridEditorSidePanel({ model, hidePersistenceControls = false }: Props) {
  const {
    colsIn,
    setColsIn,
    rowsIn,
    setRowsIn,
    gridStyle,
    setGridStyle,
    cols,
    rows,
    cells,
    groupStyles,
    selectedKeys,
    selectCell,
    error,
    canUndo,
    canRedo,
    undo,
    redo,
    unmergeSelected,
    selectAllAnchors,
    selectEntireRowsInSelectionBounds,
    selectEntireColumnsInSelectionBounds,
    clearSelectionContent,
    copySelection,
    pasteSelection,
    duplicateSelection,
    mergeColspanIn,
    setMergeColspanIn,
    mergeRowspanIn,
    setMergeRowspanIn,
    cellWStr,
    setCellWStr,
    cellHStr,
    setCellHStr,
    cellWFocusRef,
    cellHFocusRef,
    hasGrid,
    buildGrid,
    loadFromLocalStorage,
    loadFromAlternateLocalStorage,
    importGridFromJsonString,
    alternateStorageImportKey,
    selected,
    updateSelected,
    clearCellOverrides,
    applyGroupToSelection,
    applyMergeFromInputs,
    applyMergeFromRectSelection,
    saveGridJson,
    patchSelectedBorderSide,
    applySelectedBorderSidesPreset,
    patchGroupBorderSide,
    applyGroupBorderSidesPreset,
    hideEditorCellInteriorText,
    setHideEditorCellInteriorText,
  } = model;

  const [secOpen, setSecOpen] = useState({
    grid: false,
    globalStyle: false,
    border: false,
    selection: false,
  });
  const [selBlockOpen, setSelBlockOpen] = useState({
    display: false,
    store: false,
    bulkStyle: false,
    borderGlobal: false,
    borderSelection: false,
  });

  const toggleSec = (k: keyof typeof secOpen) => {
    setSecOpen((s) => ({ ...s, [k]: !s[k] }));
  };
  const toggleSelBlock = (k: keyof typeof selBlockOpen) => {
    setSelBlockOpen((s) => ({ ...s, [k]: !s[k] }));
  };

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

  const canMergeRectSelection = useMemo(
    () =>
      hasGrid &&
      selectedKeys.length >= 2 &&
      solidAnchorRectangleForMerge(selectedKeys, cells) !== null,
    [cells, hasGrid, selectedKeys],
  );

  return (
    <aside className="flex w-full shrink-0 flex-col gap-2 overflow-y-auto border-b border-zinc-200 bg-gradient-to-b from-white to-zinc-50/90 p-2.5 dark:border-zinc-800 dark:from-zinc-950 dark:to-zinc-900/90 lg:h-full lg:max-h-none lg:w-[272px] lg:border-b-0 lg:border-r lg:p-3 xl:w-[288px]">
      {hasGrid && (
        <div className="rounded-lg border border-zinc-200 bg-white p-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80">
          <div className="flex flex-wrap items-center gap-1">
            <button type="button" className={btnLine} disabled={!canUndo} onClick={undo} title="⌘/Ctrl+Z">
              ↩
            </button>
            <button type="button" className={btnLine} disabled={!canRedo} onClick={redo} title="⌘/Ctrl+Shift+Z">
              ↪
            </button>
            <span className="mx-0.5 h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
            <button type="button" className={btnMini} disabled={selectedKeys.length === 0} onClick={copySelection}>
              복사
            </button>
            <button type="button" className={btnMini} disabled={selectedKeys.length === 0} onClick={pasteSelection}>
              붙여
            </button>
            <button type="button" className={btnMini} disabled={selectedKeys.length === 0} onClick={duplicateSelection}>
              복제
            </button>
          </div>
          <p className="mt-1.5 text-[9px] leading-snug text-zinc-500">
            {hasGrid ? `${cols}열 × ${rows}행` : ""}
            {selectedKeys.length > 0 ? ` · ${selectedKeys.length}칸 선택` : ""}
          </p>
        </div>
      )}

      {selectedKeys.length > 0 && (
        <SelectionStyleInspector
          selectedKeys={selectedKeys}
          cells={cells}
          gridStyle={gridStyle}
          groupStyles={groupStyles}
          updateSelected={updateSelected}
          clearCellOverrides={clearCellOverrides}
          patchSelectedBorderSide={patchSelectedBorderSide}
          applySelectedBorderSidesPreset={applySelectedBorderSidesPreset}
          patchGroupBorderSide={patchGroupBorderSide}
          applyGroupBorderSidesPreset={applyGroupBorderSidesPreset}
        />
      )}

      <CollapsibleSideSection
        title="그리드"
        open={secOpen.grid}
        onToggle={() => toggleSec("grid")}
      >
        <div className="grid grid-cols-2 gap-x-1 gap-y-1">
          <label className="flex flex-col gap-px text-[9px] text-zinc-500">
            열
            <input
              type="number"
              min={1}
              max={MAX_DIM}
              value={colsIn}
              onChange={(e) => setColsIn(normalizeUnsignedIntString(e.target.value))}
              className={inSm}
            />
          </label>
          <label className="flex flex-col gap-px text-[9px] text-zinc-500">
            행
            <input
              type="number"
              min={1}
              max={MAX_DIM}
              value={rowsIn}
              onChange={(e) => setRowsIn(normalizeUnsignedIntString(e.target.value))}
              className={inSm}
            />
          </label>
          <label className="flex flex-col gap-px text-[9px] text-zinc-500">
            셀 W
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={cellWStr}
              onFocus={() => {
                cellWFocusRef.current = true;
                setCellWStr(String(gridStyle.cellWidth));
              }}
              onBlur={() => {
                cellWFocusRef.current = false;
                const n = cellWStr === "" ? 0 : parseInt(cellWStr, 10) || 0;
                const c = clamp(n, MIN_WH, MAX_WH);
                setGridStyle((s) => ({ ...s, cellWidth: c }));
                setCellWStr(String(c));
              }}
              onChange={(e) => {
                const s = sanitizePixelDigits(e.target.value);
                setCellWStr(s);
                if (s !== "") {
                  const n = parseInt(s, 10);
                  setGridStyle((prev) => ({
                    ...prev,
                    cellWidth: clamp(n, MIN_WH, MAX_WH),
                  }));
                }
              }}
              className={inSm}
            />
          </label>
          <label className="flex flex-col gap-px text-[9px] text-zinc-500">
            셀 H
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={cellHStr}
              onFocus={() => {
                cellHFocusRef.current = true;
                setCellHStr(String(gridStyle.cellHeight));
              }}
              onBlur={() => {
                cellHFocusRef.current = false;
                const n = cellHStr === "" ? 0 : parseInt(cellHStr, 10) || 0;
                const c = clamp(n, MIN_WH, MAX_WH);
                setGridStyle((s) => ({ ...s, cellHeight: c }));
                setCellHStr(String(c));
              }}
              onChange={(e) => {
                const s = sanitizePixelDigits(e.target.value);
                setCellHStr(s);
                if (s !== "") {
                  const n = parseInt(s, 10);
                  setGridStyle((prev) => ({
                    ...prev,
                    cellHeight: clamp(n, MIN_WH, MAX_WH),
                  }));
                }
              }}
              className={inSm}
            />
          </label>
        </div>
        <div className="mt-1 flex flex-col gap-1">
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={buildGrid} className={btnSolid}>
              생성
            </button>
            {!hidePersistenceControls && hasGrid && (
              <button type="button" onClick={saveGridJson} className={btnLine}>
                저장
              </button>
            )}
          </div>
          {!hidePersistenceControls && (
            <div className="flex flex-wrap gap-1 border-t border-zinc-100 pt-1 dark:border-zinc-800">
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
          )}
          <label className="flex cursor-pointer items-center gap-1.5 text-[9px] text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              className="size-3 shrink-0 rounded border-zinc-300 accent-zinc-800 dark:accent-zinc-200"
              checked={hideEditorCellInteriorText}
              onChange={(e) => setHideEditorCellInteriorText(e.target.checked)}
            />
            기본 장식만 숨김 (전역 배경·좌표 번호). 이름·매대·그룹 라벨은 표시
          </label>
        </div>
        {error && <p className="mt-1 text-[9px] leading-tight text-red-600">{error}</p>}
      </CollapsibleSideSection>

      {hasGrid && (
        <CollapsibleSideSection
          title="전역 스타일"
          open={secOpen.globalStyle}
          onToggle={() => toggleSec("globalStyle")}
        >
          <div className="space-y-3">
            <ColorField
              label="기본 글자색"
              value={gridStyle.fontColor}
              fallback="#0f172a"
              swatches={TEXT_SWATCHES}
              onChange={(hex) => setGridStyle((s) => ({ ...s, fontColor: hex }))}
            />
            <ColorField
              label="기본 셀 배경"
              value={gridStyle.cellFill}
              fallback="#ffffff"
              swatches={FILL_SWATCHES}
              onChange={(hex) => setGridStyle((s) => ({ ...s, cellFill: hex }))}
            />
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-300">기본 글자 크기</span>
              <input
                type="number"
                min={0}
                max={48}
                value={gridStyle.fontSize}
                onChange={(e) => {
                  const n = parseNonNegInt(e.target.value);
                  setGridStyle((s) => ({
                    ...s,
                    fontSize: clamp(n ?? 0, 0, 48),
                  }));
                }}
                className={inSm}
              />
            </label>
          </div>
        </CollapsibleSideSection>
      )}

      {hasGrid && (
        <CollapsibleSideSection
          title="전역 테두리"
          open={secOpen.border}
          onToggle={() => toggleSec("border")}
        >
          <div className="space-y-3">
            <ToggleRow
              label="그리드 기본 테두리"
              checked={gridStyle.showBorder && gridStyle.borderWidth > 0}
              onChange={(on) =>
                setGridStyle((s) => ({
                  ...s,
                  showBorder: on,
                  borderWidth: on ? Math.max(1, s.borderWidth) : 0,
                  ...(!on ? { borderSides: undefined } : {}),
                }))
              }
            />
            <ColorField
              label="선 색상"
              value={gridStyle.borderColor}
              fallback={DEFAULT_BORDER_COLOR}
              swatches={BORDER_SWATCHES}
              onChange={(hex) =>
                setGridStyle((s) => ({
                  ...s,
                  borderColor: hex,
                  showBorder: true,
                  borderWidth: Math.max(DEFAULT_BORDER_WIDTH, s.borderWidth || 0),
                }))
              }
            />
            <WidthSlider
              value={gridStyle.borderWidth}
              onChange={(bw) =>
                setGridStyle((s) => ({
                  ...s,
                  borderWidth: bw,
                  ...(bw > 0 ? { showBorder: true } : { showBorder: false, borderSides: undefined }),
                }))
              }
            />
            <LineStylePicker
              value={gridStyle.borderStyle}
              onChange={(v) => setGridStyle((s) => ({ ...s, borderStyle: v }))}
            />
            <BorderEdgePicker
              sides={globalBorderSidesForDisplay(gridStyle)}
              onToggle={(edge, on) => {
                setGridStyle((prev) => {
                  const cur = prev.borderSides ?? DEFAULT_BORDER_SIDES;
                  const borderSides: BorderSides = { ...cur, [edge]: on };
                  const anySide =
                    borderSides.top || borderSides.right || borderSides.bottom || borderSides.left;
                  if (!anySide) {
                    return { ...prev, showBorder: false, borderWidth: 0, borderSides: undefined };
                  }
                  return {
                    ...prev,
                    borderSides,
                    showBorder: true,
                    borderWidth: Math.max(1, prev.borderWidth),
                  };
                });
              }}
              onPreset={(key) => {
                if (key === "none") {
                  setGridStyle((p) => ({
                    ...p,
                    showBorder: false,
                    borderWidth: 0,
                    borderSides: undefined,
                  }));
                } else {
                  setGridStyle((p) => ({
                    ...p,
                    borderSides: { ...BORDER_PRESET_SIDES[key] },
                    showBorder: true,
                    borderWidth: Math.max(1, p.borderWidth),
                  }));
                }
              }}
            />
          </div>
        </CollapsibleSideSection>
      )}

      <CollapsibleSideSection
        title="선택 · 데이터"
        open={secOpen.selection}
        onToggle={() => toggleSec("selection")}
        sectionClassName={`${sideSectionBase} ${secOpen.selection ? "min-h-0 flex-1" : "shrink-0"}`}
      >
        {selectedKeys.length === 0 && (
          <div className="mt-1 space-y-2">
            <p className="text-[9px] leading-snug text-zinc-500">그리드에서 칸을 클릭하세요.</p>
            {hasGrid && (
              <button type="button" onClick={selectAllAnchors} className={`w-full ${btnLine}`}>
                전체 선택 (⌘/Ctrl+A)
              </button>
            )}
          </div>
        )}
        {selectedKeys.length > 1 && (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                disabled={!canMergeRectSelection}
                title={
                  canMergeRectSelection
                    ? "선택한 직사각형을 한 칸으로 병합합니다."
                    : "1×1 칸만, 빈틈 없는 직사각형으로 두 칸 이상 선택하세요."
                }
                onClick={applyMergeFromRectSelection}
                className={`${btnSolid} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                선택 직사각형 병합
              </button>
            </div>
            <BulkGroupPanel
              key={selectedKeys.join("|")}
              initialGroup={cells.get(selectedKeys[0])?.groupCode ?? ""}
              count={selectedKeys.length}
              applyGroupToSelection={applyGroupToSelection}
              selectCell={selectCell}
            />
            <div className="flex flex-wrap gap-1">
              <button type="button" className={btnMini} onClick={selectEntireRowsInSelectionBounds}>
                행 전체
              </button>
              <button type="button" className={btnMini} onClick={selectEntireColumnsInSelectionBounds}>
                열 전체
              </button>
              <button type="button" className={btnMini} onClick={clearSelectionContent}>
                내용 지우기
              </button>
            </div>
          </div>
        )}
        {selectedKeys.length === 1 && selected?.mergedInto && (
          <div className="mt-1.5 space-y-1 text-[10px] leading-snug">
            <p className="text-zinc-600 dark:text-zinc-300">병합 범위의 하위 칸입니다.</p>
            <button
              type="button"
              onClick={() => selectCell(selected.mergedInto, cells)}
              className={`w-full ${btnLine}`}
            >
              기준 칸으로 이동 ({selected.mergedInto})
            </button>
          </div>
        )}
        {selectedKeys.length === 1 && selected && !selected.mergedInto && (
            <div className="mt-1.5 space-y-2 text-[10px] leading-snug">
              <p className="text-[9px] text-zinc-500">
                열 {selected.col + 1} · 행 {selected.row + 1}
              </p>

              <div className="rounded border border-zinc-200 bg-zinc-50/90 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900/50">
                <p className="mb-1 text-[9px] font-medium text-zinc-600 dark:text-zinc-300">병합 (가로×세로)</p>
                <div className="flex flex-wrap items-end gap-1">
                  <label className="flex flex-col gap-px text-[9px] text-zinc-500">
                    너비 (칸)
                    <input
                      type="number"
                      min={1}
                      max={cols - selected.col}
                      value={mergeColspanIn}
                      onChange={(e) => setMergeColspanIn(normalizeUnsignedIntString(e.target.value))}
                      className={`${inSm} w-11`}
                    />
                  </label>
                  <label className="flex flex-col gap-px text-[9px] text-zinc-500">
                    높이 (칸)
                    <input
                      type="number"
                      min={1}
                      max={rows - selected.row}
                      value={mergeRowspanIn}
                      onChange={(e) => setMergeRowspanIn(normalizeUnsignedIntString(e.target.value))}
                      className={`${inSm} w-11`}
                    />
                  </label>
                  <button type="button" onClick={applyMergeFromInputs} className={btnSolid}>
                    적용
                  </button>
                  {(selected.colspan > 1 || selected.rowspan > 1) && (
                    <button type="button" onClick={unmergeSelected} className={btnLine}>
                      병합 해제
                    </button>
                  )}
                </div>
              </div>

              <CollapsibleSubBlock
                title="매장 데이터"
                open={selBlockOpen.store}
                onToggle={() => toggleSelBlock("store")}
              >
                <label className="flex flex-col gap-px">
                  <span className="text-[9px] text-zinc-500">그룹</span>
                <input
                  value={selected.groupCode}
                  maxLength={40}
                  placeholder="구역 그룹"
                  onChange={(e) =>
                    updateSelected({ groupCode: e.target.value.slice(0, 40) })
                  }
                  className={inSm}
                />
              </label>
              <p className="text-[8px] leading-tight text-zinc-400">
                같은 그룹 코드를 가진 칸은 그룹 단위 스타일을 공유합니다.
              </p>
              <label className="flex flex-col gap-px">
                <span className="text-[9px] text-zinc-500">선반</span>
                <input
                  value={selected.shelfCode}
                  onChange={(e) => updateSelected({ shelfCode: e.target.value })}
                  className={inSm}
                />
              </label>
              <label className="flex flex-col gap-px">
                <span className="text-[9px] text-zinc-500">단</span>
                <select
                  value={selected.tier === null ? "" : String(selected.tier)}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateSelected({
                      tier: v === "" ? null : Number(v) === 1 ? 1 : Number(v) === 2 ? 2 : Number(v) === 3 ? 3 : 4,
                    });
                  }}
                  className={inSm}
                >
                  <option value="">없음</option>
                  {TIER_INDICES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-px">
                <span className="text-[9px] text-zinc-500">칸 이름</span>
                <input
                  value={selected.cellName}
                  onChange={(e) => updateSelected({ cellName: e.target.value })}
                  className={inSm}
                />
              </label>
              </CollapsibleSubBlock>
          </div>
        )}
      </CollapsibleSideSection>
    </aside>
  );
}
