"use client";

import { useMemo, useRef, useState } from "react";
import { TIER_INDICES } from "@/domain/constants";
import { ZoneSubdivideForm } from "@/experiments/_shared/ZoneSubdivideForm";
import {
  clamp,
  DEFAULT_BORDER_COLOR,
  DEFAULT_BORDER_WIDTH,
  DEFAULT_BORDER_SIDES,
} from "@/experiments/konva/grid-editor-cell-draw";
import type { BorderSides, EditorGridStyle } from "@/experiments/konva/grid-editor-types";
import type { GridEditorModel } from "@/experiments/grid-editor/useGridEditorModel";
import { SelectionStyleInspector } from "@/experiments/grid-editor/SelectionStyleInspector";
import { BORDER_PRESET_SIDES } from "@/experiments/grid-editor/border-presets";
import { MAX_DIM, MIN_WH, MAX_WH } from "@/experiments/grid-editor/constants";
import { solidAnchorRectangleForMerge } from "@/experiments/grid-editor/grid-selection-utils";
import { normalizeUnsignedIntString, parseNonNegInt, sanitizePixelDigits } from "@/experiments/grid-editor/input-utils";
import {
  BORDER_SWATCHES,
  BorderEdgePicker,
  ColorField,
  FILL_SWATCHES,
  LineStylePicker,
  TEXT_SWATCHES,
  ToggleRow,
  WidthSlider,
} from "@/experiments/grid-editor/grid-style-controls";

type TabId = "select" | "grid" | "style";

const TABS: { id: TabId; label: string }[] = [
  { id: "select", label: "선택" },
  { id: "grid", label: "그리드" },
  { id: "style", label: "스타일" },
];

const inField =
  "h-8 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-xs text-zinc-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const lbl = "mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-400";
const btnPrimary =
  "inline-flex h-8 items-center justify-center rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white";
const btnSecondary =
  "inline-flex h-8 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";
const btnGhost =
  "inline-flex h-7 items-center justify-center rounded-md px-2 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800";

function globalBorderSidesForDisplay(g: EditorGridStyle): BorderSides {
  if (!g.showBorder || g.borderWidth <= 0) {
    return { top: false, right: false, bottom: false, left: false };
  }
  return g.borderSides ?? DEFAULT_BORDER_SIDES;
}

type Props = { model: GridEditorModel };

export function KonvaEditorSidePanel({ model }: Props) {
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
    unmergeSelected,
    selectAllAnchors,
    selectEntireRowsInSelectionBounds,
    selectEntireColumnsInSelectionBounds,
    clearSelectionContent,
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
    selected,
    updateSelected,
    clearCellOverrides,
    applyGroupToSelection,
    applyMergeFromInputs,
    applyMergeFromRectSelection,
    patchSelectedBorderSide,
    applySelectedBorderSidesPreset,
    patchGroupBorderSide,
    applyGroupBorderSidesPreset,
    hideEditorCellInteriorText,
    setHideEditorCellInteriorText,
    subdivideSelectedZone,
    copySelectionStyle,
    pasteSelectionStyle,
    styleClipboardInfo,
  } = model;

  const [tab, setTab] = useState<TabId>("grid");
  const bulkGroupRef = useRef<HTMLInputElement>(null);

  const canMergeRectSelection = useMemo(
    () =>
      hasGrid &&
      selectedKeys.length >= 2 &&
      solidAnchorRectangleForMerge(selectedKeys, cells) !== null,
    [cells, hasGrid, selectedKeys],
  );

  return (
    <aside className="flex max-h-[min(45dvh,480px)] min-h-0 w-full shrink-0 flex-col overflow-hidden border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 lg:h-full lg:max-h-none lg:w-[320px] lg:border-b-0 lg:border-r xl:w-[340px]">
      {/* 상태 */}
      <div className="shrink-0 border-b border-zinc-100 px-3 py-2.5 dark:border-zinc-800">
        <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-50">편집 패널</p>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          {hasGrid ? `${cols}열 × ${rows}행` : "그리드 미생성"}
          {selectedKeys.length > 0 ? ` · ${selectedKeys.length}칸 선택` : ""}
        </p>
      </div>

      {/* 탭 */}
      <div className="grid shrink-0 grid-cols-3 gap-0.5 border-b border-zinc-100 p-1.5 dark:border-zinc-800">
        {TABS.map((t) => {
          const active = tab === t.id;
          const badge =
            t.id === "select" && selectedKeys.length > 0 ? selectedKeys.length : null;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`relative flex flex-col items-center justify-center rounded-md py-2 text-[11px] font-medium transition ${
                active
                  ? "bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
              }`}
            >
              {t.label}
              {badge != null ? (
                <span
                  className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold ${
                    active ? "bg-sky-500 text-white" : "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-200"
                  }`}
                >
                  {badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* 탭 본문 */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "select" && (
          <div className="space-y-4">
            {selectedKeys.length === 0 && (
              <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 p-4 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
                <p className="text-xs text-zinc-600 dark:text-zinc-300">그리드에서 칸을 클릭하세요.</p>
                <p className="mt-1 text-[11px] text-zinc-500">Ctrl+클릭 다중 · Shift+클릭 범위</p>
                {hasGrid && (
                  <button type="button" onClick={selectAllAnchors} className={`mt-3 w-full ${btnSecondary}`}>
                    전체 선택
                  </button>
                )}
              </div>
            )}

            {selectedKeys.length > 1 && (
              <section className="space-y-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">{selectedKeys.length}칸 선택</h3>
                <button
                  type="button"
                  disabled={!canMergeRectSelection}
                  onClick={applyMergeFromRectSelection}
                  className={`w-full ${btnPrimary}`}
                >
                  직사각형 병합
                </button>
                <label className="block">
                  <span className={lbl}>그룹 일괄 적용</span>
                  <input
                    key={selectedKeys.join("|")}
                    ref={bulkGroupRef}
                    defaultValue={cells.get(selectedKeys[0]!)?.groupCode ?? ""}
                    maxLength={40}
                    className={inField}
                    placeholder="구역 코드"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => applyGroupToSelection(bulkGroupRef.current?.value ?? "")}
                    className={`flex-1 ${btnPrimary}`}
                  >
                    적용
                  </button>
                  <button type="button" onClick={() => selectCell(null)} className={`flex-1 ${btnSecondary}`}>
                    선택 해제
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button type="button" onClick={selectEntireRowsInSelectionBounds} className={btnGhost}>
                    행 전체
                  </button>
                  <button type="button" onClick={selectEntireColumnsInSelectionBounds} className={btnGhost}>
                    열 전체
                  </button>
                  <button type="button" onClick={clearSelectionContent} className={btnGhost}>
                    내용 지우기
                  </button>
                </div>
              </section>
            )}

            {selectedKeys.length === 1 && selected?.mergedInto && (
              <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                <p className="text-xs text-amber-900 dark:text-amber-200">병합된 하위 칸입니다.</p>
                <button
                  type="button"
                  onClick={() => selectCell(selected.mergedInto, cells)}
                  className={`mt-2 w-full ${btnSecondary}`}
                >
                  기준 칸으로 이동
                </button>
              </section>
            )}

            {selectedKeys.length === 1 && selected && !selected.mergedInto && (
              <>
                <section className="space-y-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">칸 정보</h3>
                    <span className="text-[11px] tabular-nums text-zinc-500">
                      {selected.col + 1}열 · {selected.row + 1}행
                      {(selected.colspan > 1 || selected.rowspan > 1) &&
                        ` · ${selected.colspan}×${selected.rowspan}`}
                    </span>
                  </div>

                  <label className="block">
                    <span className={lbl}>칸 이름</span>
                    <input
                      value={selected.cellName}
                      onChange={(e) => updateSelected({ cellName: e.target.value })}
                      className={inField}
                      placeholder="표시 이름"
                    />
                  </label>
                  <label className="block">
                    <span className={lbl}>구역 코드</span>
                    <input
                      value={selected.groupCode}
                      maxLength={40}
                      onChange={(e) => updateSelected({ groupCode: e.target.value.slice(0, 40) })}
                      className={inField}
                      placeholder="S1, S1-A …"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className={lbl}>매대 코드</span>
                      <input
                        value={selected.shelfCode}
                        onChange={(e) => updateSelected({ shelfCode: e.target.value })}
                        className={inField}
                        placeholder="A1"
                      />
                    </label>
                    <label className="block">
                      <span className={lbl}>단</span>
                      <select
                        value={selected.tier === null ? "" : String(selected.tier)}
                        onChange={(e) => {
                          const v = e.target.value;
                          updateSelected({
                            tier:
                              v === ""
                                ? null
                                : Number(v) === 1
                                  ? 1
                                  : Number(v) === 2
                                    ? 2
                                    : Number(v) === 3
                                      ? 3
                                      : 4,
                          });
                        }}
                        className={inField}
                      >
                        <option value="">없음</option>
                        {TIER_INDICES.map((t) => (
                          <option key={t} value={t}>
                            {t}단
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </section>

                <section className="space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                  <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">병합</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className={lbl}>가로 (칸)</span>
                      <input
                        type="number"
                        min={1}
                        max={cols - selected.col}
                        value={mergeColspanIn}
                        onChange={(e) => setMergeColspanIn(normalizeUnsignedIntString(e.target.value))}
                        className={inField}
                      />
                    </label>
                    <label className="block">
                      <span className={lbl}>세로 (칸)</span>
                      <input
                        type="number"
                        min={1}
                        max={rows - selected.row}
                        value={mergeRowspanIn}
                        onChange={(e) => setMergeRowspanIn(normalizeUnsignedIntString(e.target.value))}
                        className={inField}
                      />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={applyMergeFromInputs} className={`flex-1 ${btnPrimary}`}>
                      병합 적용
                    </button>
                    {(selected.colspan > 1 || selected.rowspan > 1) && (
                      <button type="button" onClick={unmergeSelected} className={`flex-1 ${btnSecondary}`}>
                        병합 해제
                      </button>
                    )}
                  </div>
                </section>

                {(selected.colspan > 1 || selected.rowspan > 1) && (
                  <ZoneSubdivideForm
                    title="구획 세분화"
                    parent={{
                      code: selected.groupCode,
                      label: selected.cellName,
                      bayCode: selected.shelfCode,
                    }}
                    spanCols={selected.colspan}
                    spanRows={selected.rowspan}
                    onApply={subdivideSelectedZone}
                    labels={{ code: "하위 구역 코드", label: "칸 이름", bay: "매대 코드" }}
                  />
                )}
              </>
            )}

            {selectedKeys.length > 0 && (
              <section className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/40 p-3 dark:border-violet-900/40 dark:bg-violet-950/20">
                <h3 className="text-xs font-semibold text-violet-800 dark:text-violet-200">디자인 복사</h3>
                <p className="text-[11px] leading-snug text-violet-700/80 dark:text-violet-300/80">
                  색·테두리·글꼴만 복사합니다. 칸 이름·매대·병합은 유지됩니다.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={copySelectionStyle}
                    className={`flex-1 ${btnSecondary}`}
                  >
                    디자인 복사
                  </button>
                  <button
                    type="button"
                    disabled={!styleClipboardInfo}
                    onClick={pasteSelectionStyle}
                    className={`flex-1 ${btnPrimary}`}
                  >
                    디자인 붙여넣기
                  </button>
                </div>
                {styleClipboardInfo ? (
                  <p className="text-[10px] text-violet-600 dark:text-violet-400">
                    클립보드: {styleClipboardInfo.width}×{styleClipboardInfo.height} · ⌘/Ctrl+Shift+C/V
                  </p>
                ) : null}
              </section>
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
          </div>
        )}

        {tab === "grid" && (
          <div className="space-y-4">
            <section className="space-y-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">격자 생성</h3>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={lbl}>열</span>
                  <input
                    type="number"
                    min={1}
                    max={MAX_DIM}
                    value={colsIn}
                    onChange={(e) => setColsIn(normalizeUnsignedIntString(e.target.value))}
                    className={inField}
                  />
                </label>
                <label className="block">
                  <span className={lbl}>행</span>
                  <input
                    type="number"
                    min={1}
                    max={MAX_DIM}
                    value={rowsIn}
                    onChange={(e) => setRowsIn(normalizeUnsignedIntString(e.target.value))}
                    className={inField}
                  />
                </label>
                <label className="block">
                  <span className={lbl}>셀 너비 (px)</span>
                  <input
                    type="text"
                    inputMode="numeric"
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
                        setGridStyle((prev) => ({
                          ...prev,
                          cellWidth: clamp(parseInt(s, 10), MIN_WH, MAX_WH),
                        }));
                      }
                    }}
                    className={inField}
                  />
                </label>
                <label className="block">
                  <span className={lbl}>셀 높이 (px)</span>
                  <input
                    type="text"
                    inputMode="numeric"
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
                        setGridStyle((prev) => ({
                          ...prev,
                          cellHeight: clamp(parseInt(s, 10), MIN_WH, MAX_WH),
                        }));
                      }
                    }}
                    className={inField}
                  />
                </label>
              </div>
              <button type="button" onClick={buildGrid} className={`w-full ${btnPrimary}`}>
                그리드 생성
              </button>
            </section>

            <section className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 rounded border-zinc-300 accent-zinc-800 dark:accent-zinc-200"
                  checked={hideEditorCellInteriorText}
                  onChange={(e) => setHideEditorCellInteriorText(e.target.checked)}
                />
                <span className="text-xs leading-snug text-zinc-600 dark:text-zinc-300">
                  기본 좌표·배경 숨김
                  <span className="mt-0.5 block text-[11px] text-zinc-400">칸 이름·구역·매대 라벨은 유지</span>
                </span>
              </label>
            </section>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
                {error}
              </p>
            )}
          </div>
        )}

        {tab === "style" && hasGrid && (
          <div className="space-y-4">
            <section className="space-y-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">기본 스타일</h3>
              <ColorField
                label="글자색"
                value={gridStyle.fontColor}
                fallback="#0f172a"
                swatches={TEXT_SWATCHES}
                onChange={(hex) => setGridStyle((s) => ({ ...s, fontColor: hex }))}
              />
              <ColorField
                label="셀 배경"
                value={gridStyle.cellFill}
                fallback="#ffffff"
                swatches={FILL_SWATCHES}
                onChange={(hex) => setGridStyle((s) => ({ ...s, cellFill: hex }))}
              />
              <label className="block">
                <span className={lbl}>글자 크기</span>
                <input
                  type="number"
                  min={0}
                  max={48}
                  value={gridStyle.fontSize}
                  onChange={(e) => {
                    const n = parseNonNegInt(e.target.value);
                    setGridStyle((s) => ({ ...s, fontSize: clamp(n ?? 0, 0, 48) }));
                  }}
                  className={inField}
                />
              </label>
            </section>

            <section className="space-y-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">기본 테두리</h3>
              <ToggleRow
                label="테두리 표시"
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
            </section>
          </div>
        )}

        {tab === "style" && !hasGrid && (
          <p className="text-xs text-zinc-500">그리드를 먼저 생성하세요.</p>
        )}
      </div>
    </aside>
  );
}
