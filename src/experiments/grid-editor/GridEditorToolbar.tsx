"use client";

import type { ReactNode } from "react";
import type { GridEditorModel } from "./useGridEditorModel";

const tbBtn =
  "inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] font-medium text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800";
const tbBtnPrimary =
  "inline-flex items-center justify-center rounded-md bg-zinc-900 px-2 py-1 text-[10px] font-medium text-white shadow-sm transition hover:bg-zinc-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white";
const tbSep = "mx-0.5 h-4 w-px shrink-0 bg-zinc-200 dark:bg-zinc-700";

type Props = {
  model: GridEditorModel;
  /** 줌·맞춤 등 캔버스 전용 컨트롤 */
  canvasControls?: ReactNode;
  zoomLabel?: string;
};

function ToolGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-0.5">
      <span className="mr-0.5 hidden text-[9px] font-medium uppercase tracking-wide text-zinc-400 sm:inline">
        {label}
      </span>
      {children}
    </div>
  );
}

export function GridEditorToolbar({ model, canvasControls, zoomLabel }: Props) {
  const {
    hasGrid,
    canUndo,
    canRedo,
    undo,
    redo,
    copySelection,
    cutSelection,
    pasteSelection,
    copySelectionStyle,
    pasteSelectionStyle,
    duplicateSelection,
    clearSelectionContent,
    selectAllAnchors,
    selectCell,
    selectedKeys,
    growSelection,
    shrinkSelectionInner,
    selectEntireRowsInSelectionBounds,
    selectEntireColumnsInSelectionBounds,
    clipboardInfo,
    styleClipboardInfo,
    showRowColHeaders,
    setShowRowColHeaders,
    hideEditorCellInteriorText,
    setHideEditorCellInteriorText,
  } = model;

  const selCount = selectedKeys.length;

  return (
    <div className="flex shrink-0 flex-col gap-1.5 border-b border-zinc-200/90 bg-gradient-to-b from-white to-zinc-50/80 px-2.5 py-2 dark:border-zinc-700 dark:from-zinc-950 dark:to-zinc-900/80">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <ToolGroup label="편집">
          <button type="button" className={tbBtn} disabled={!canUndo} onClick={undo} title="되돌리기 (⌘/Ctrl+Z)">
            ↩ 되돌리기
          </button>
          <button type="button" className={tbBtn} disabled={!canRedo} onClick={redo} title="다시 실행 (⌘/Ctrl+Shift+Z)">
            ↪ 다시
          </button>
        </ToolGroup>

        <span className={tbSep} aria-hidden />

        <ToolGroup label="클립">
          <button
            type="button"
            className={tbBtn}
            disabled={!hasGrid || selCount === 0}
            onClick={copySelection}
            title="복사 (⌘/Ctrl+C)"
          >
            복사
          </button>
          <button
            type="button"
            className={tbBtn}
            disabled={!hasGrid || selCount === 0}
            onClick={cutSelection}
            title="잘라내기 (⌘/Ctrl+X)"
          >
            잘라
          </button>
          <button
            type="button"
            className={tbBtnPrimary}
            disabled={!hasGrid || !clipboardInfo}
            onClick={pasteSelection}
            title="붙여넣기 (⌘/Ctrl+V)"
          >
            붙여넣기
          </button>
          <button
            type="button"
            className={tbBtn}
            disabled={!hasGrid || selCount === 0}
            onClick={duplicateSelection}
            title="복제 (⌘/Ctrl+D)"
          >
            복제
          </button>
          <button
            type="button"
            className={tbBtn}
            disabled={!hasGrid || selCount === 0}
            onClick={copySelectionStyle}
            title="디자인만 복사 (⌘/Ctrl+Shift+C)"
          >
            디자인
          </button>
          <button
            type="button"
            className={tbBtn}
            disabled={!hasGrid || selCount === 0 || !styleClipboardInfo}
            onClick={pasteSelectionStyle}
            title="디자인만 붙여넣기 (⌘/Ctrl+Shift+V)"
          >
            디자인 붙여
          </button>
        </ToolGroup>

        <span className={tbSep} aria-hidden />

        <ToolGroup label="선택">
          <button
            type="button"
            className={tbBtn}
            disabled={!hasGrid}
            onClick={selectAllAnchors}
            title="전체 선택 (⌘/Ctrl+A)"
          >
            전체
          </button>
          <button
            type="button"
            className={tbBtn}
            disabled={!hasGrid || selCount === 0}
            onClick={() => selectCell(null)}
            title="선택 해제 (Esc)"
          >
            해제
          </button>
          <button
            type="button"
            className={tbBtn}
            disabled={!hasGrid || selCount === 0}
            onClick={clearSelectionContent}
            title="내용 지우기 (Delete)"
          >
            내용 지우기
          </button>
        </ToolGroup>

        <span className={tbSep} aria-hidden />

        <ToolGroup label="범위">
          <button type="button" className={tbBtn} disabled={!hasGrid || selCount === 0} onClick={() => growSelection("up")} title="↑">
            ↑
          </button>
          <button type="button" className={tbBtn} disabled={!hasGrid || selCount === 0} onClick={() => growSelection("down")} title="↓">
            ↓
          </button>
          <button type="button" className={tbBtn} disabled={!hasGrid || selCount === 0} onClick={() => growSelection("left")} title="←">
            ←
          </button>
          <button type="button" className={tbBtn} disabled={!hasGrid || selCount === 0} onClick={() => growSelection("right")} title="→">
            →
          </button>
          <button type="button" className={tbBtn} disabled={!hasGrid || selCount === 0} onClick={shrinkSelectionInner} title="범위 축소">
            축소
          </button>
          <button
            type="button"
            className={tbBtn}
            disabled={!hasGrid || selCount === 0}
            onClick={selectEntireRowsInSelectionBounds}
            title="선택 행 전체"
          >
            행
          </button>
          <button
            type="button"
            className={tbBtn}
            disabled={!hasGrid || selCount === 0}
            onClick={selectEntireColumnsInSelectionBounds}
            title="선택 열 전체"
          >
            열
          </button>
        </ToolGroup>

        {canvasControls ? (
          <>
            <span className={tbSep} aria-hidden />
            <ToolGroup label="보기">{canvasControls}</ToolGroup>
          </>
        ) : null}

        {zoomLabel ? (
          <span className="ml-auto text-[10px] tabular-nums text-zinc-500">{zoomLabel}</span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-zinc-500">
        <label className="flex cursor-pointer items-center gap-1">
          <input
            type="checkbox"
            className="size-3 rounded border-zinc-300 accent-zinc-800 dark:accent-zinc-200"
            checked={showRowColHeaders}
            onChange={(e) => setShowRowColHeaders(e.target.checked)}
          />
          행·열 머리글
        </label>
        <label className="flex cursor-pointer items-center gap-1">
          <input
            type="checkbox"
            className="size-3 rounded border-zinc-300 accent-zinc-800 dark:accent-zinc-200"
            checked={hideEditorCellInteriorText}
            onChange={(e) => setHideEditorCellInteriorText(e.target.checked)}
          />
          기본 좌표 숨김
        </label>
        {hasGrid && selCount > 0 ? (
          <span className="rounded-full bg-sky-50 px-2 py-0.5 font-medium text-sky-800 dark:bg-sky-950/50 dark:text-sky-300">
            {selCount}칸 선택
          </span>
        ) : null}
        {clipboardInfo ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            클립보드 {clipboardInfo.width}×{clipboardInfo.height}
          </span>
        ) : null}
        {styleClipboardInfo ? (
          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300">
            디자인 {styleClipboardInfo.width}×{styleClipboardInfo.height}
          </span>
        ) : null}
        <span className="hidden sm:inline">⌘/Ctrl+Shift+C/V 디자인 · C/V 복사·붙여넣기</span>
      </div>
    </div>
  );
}
