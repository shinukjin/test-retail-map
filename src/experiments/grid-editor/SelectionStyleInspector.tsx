"use client";

import { useState } from "react";
import {
  clamp,
  cellWantsBorderEdge,
  DEFAULT_BORDER_COLOR,
  DEFAULT_BORDER_STYLE,
  DEFAULT_BORDER_WIDTH,
  effectiveBorderSides,
  groupStyleForCell,
  normalizeColorHex,
} from "@/experiments/konva/grid-editor-cell-draw";
import type {
  BorderLineStyle,
  BorderSides,
  EditorGridCell,
  EditorGridStyle,
  EditorGroupStyle,
  TextAlignH,
  TextAlignV,
} from "@/experiments/konva/grid-editor-types";
import { EMPTY_GRID_ANCHOR } from "@/experiments/konva/grid-editor-types";
import type { GridEditorModel } from "./useGridEditorModel";
import {
  BORDER_SWATCHES,
  BorderEdgePicker,
  ColorField,
  FILL_SWATCHES,
  LineStylePicker,
  MiniBtn,
  StyleCard,
  StyleTabBar,
  TEXT_SWATCHES,
  ToggleRow,
  WidthSlider,
  type StyleTab,
} from "./grid-style-controls";
import { parseNonNegInt } from "./input-utils";

function explicitTextColorOverride(gridStyle: EditorGridStyle, raw: string): Partial<EditorGridCell> {
  return {
    textColor: normalizeColorHex(raw, normalizeColorHex(gridStyle.fontColor, "#0f172a")),
  };
}

function explicitCellFillOverride(gridStyle: EditorGridStyle, raw: string): Partial<EditorGridCell> {
  return {
    cellFill: normalizeColorHex(raw, normalizeColorHex(gridStyle.cellFill, "#ffffff")),
  };
}

function explicitBorderColorOverride(raw: string, basisWidth: number): Partial<EditorGridCell> {
  const color = normalizeColorHex(raw, DEFAULT_BORDER_COLOR);
  return {
    borderColor: color,
    showBorder: true,
    borderWidth: Math.max(DEFAULT_BORDER_WIDTH, basisWidth),
    borderStyle: DEFAULT_BORDER_STYLE,
    borderSides: { top: true, right: true, bottom: true, left: true },
  };
}

function selectionStyleTargets(
  keys: string[],
  cellMap: Map<string, EditorGridCell>,
): EditorGridCell[] {
  return keys.map((k) => cellMap.get(k)).filter((c): c is EditorGridCell => !!c && !c.mergedInto);
}

function commonTrimmedGroupFromSelection(
  keys: string[],
  cellMap: Map<string, EditorGridCell>,
): string | null {
  if (keys.length === 0) return null;
  const first = cellMap.get(keys[0]!);
  if (!first) return null;
  const g = first.groupCode.trim();
  if (!g) return null;
  for (const k of keys) {
    const c = cellMap.get(k);
    if (!c || c.groupCode.trim() !== g) return null;
  }
  return g;
}

function allStyleSame<T>(targets: EditorGridCell[], read: (c: EditorGridCell) => T): boolean {
  if (targets.length <= 1) return true;
  const v0 = read(targets[0]!);
  return targets.every((c) => read(c) === v0);
}

type Props = {
  selectedKeys: string[];
  cells: Map<string, EditorGridCell>;
  gridStyle: EditorGridStyle;
  groupStyles: Record<string, EditorGroupStyle>;
  updateSelected: GridEditorModel["updateSelected"];
  clearCellOverrides: GridEditorModel["clearCellOverrides"];
  patchSelectedBorderSide: GridEditorModel["patchSelectedBorderSide"];
  applySelectedBorderSidesPreset: GridEditorModel["applySelectedBorderSidesPreset"];
  patchGroupBorderSide: GridEditorModel["patchGroupBorderSide"];
  applyGroupBorderSidesPreset: GridEditorModel["applyGroupBorderSidesPreset"];
};

export function SelectionStyleInspector({
  selectedKeys,
  cells,
  gridStyle,
  groupStyles,
  updateSelected,
  clearCellOverrides,
  patchSelectedBorderSide,
  applySelectedBorderSidesPreset,
  patchGroupBorderSide,
  applyGroupBorderSidesPreset,
}: Props) {
  const [tab, setTab] = useState<StyleTab>("fill");
  const targets = selectionStyleTargets(selectedKeys, cells);
  const groupCodeCommon = commonTrimmedGroupFromSelection(selectedKeys, cells);

  if (selectedKeys.length === 0) return null;

  if (targets.length === 0) {
    return (
      <StyleCard title="스타일">
        <p className="text-[10px] leading-snug text-zinc-500">
          병합된 하위 칸입니다. 스타일을 바꾸려면 <strong>병합 시작 칸</strong>을 선택하세요.
        </p>
      </StyleCard>
    );
  }

  const primary = targets[0]!;
  const countLabel = `${targets.length}칸`;

  const textColorValue = normalizeColorHex(
    primary.textColor ?? "",
    normalizeColorHex(gridStyle.fontColor, "#0f172a"),
  );

  const cellFillValue = normalizeColorHex(
    primary.cellFill ?? "",
    normalizeColorHex(gridStyle.cellFill, "#ffffff"),
  );

  const cellFillUniform = allStyleSame(targets, (c) => c.cellFill ?? gridStyle.cellFill);
  const fontUniform = allStyleSame(targets, (c) => c.fontSize);
  const fontInputValue = fontUniform
    ? primary.fontSize === undefined
      ? ""
      : String(primary.fontSize)
    : "";

  const alignHUniform = allStyleSame(targets, (c) => c.alignH ?? "center");
  const alignVUniform = allStyleSame(targets, (c) => c.alignV ?? "middle");
  const curAlignH: TextAlignH | null = alignHUniform ? (primary.alignH ?? "center") : null;
  const curAlignV: TextAlignV | null = alignVUniform ? (primary.alignV ?? "middle") : null;

  const effShowBorder = (c: EditorGridCell) => {
    const grp = groupStyleForCell(c, groupStyles);
    return c.showBorder ?? grp?.showBorder ?? gridStyle.showBorder;
  };
  const allBorderOn = targets.every(effShowBorder);
  const borderMixed = !allBorderOn && !targets.every((c) => !effShowBorder(c));

  const borderWidthUniform = allStyleSame(
    targets,
    (c) => c.borderWidth ?? DEFAULT_BORDER_WIDTH,
  );
  const borderColorVal = normalizeColorHex(primary.borderColor ?? "", DEFAULT_BORDER_COLOR);
  const borderWidthVal = primary.borderWidth ?? DEFAULT_BORDER_WIDTH;

  const borderStyleUniform = allStyleSame(
    targets,
    (c) => c.borderStyle ?? DEFAULT_BORDER_STYLE,
  );
  const curBorderStyle: BorderLineStyle | null = borderStyleUniform
    ? (primary.borderStyle ?? DEFAULT_BORDER_STYLE)
    : null;

  const edgeMixed: Partial<Record<keyof BorderSides, boolean>> = {};
  const sidesDisplay: BorderSides = { top: false, right: false, bottom: false, left: false };
  for (const edge of ["top", "right", "bottom", "left"] as const) {
    const allOn = targets.every((c) =>
      cellWantsBorderEdge(c, gridStyle, edge, groupStyleForCell(c, groupStyles)),
    );
    const allOff = targets.every(
      (c) => !cellWantsBorderEdge(c, gridStyle, edge, groupStyleForCell(c, groupStyles)),
    );
    sidesDisplay[edge] = allOn;
    if (!allOn && !allOff) edgeMixed[edge] = true;
  }

  const segBtn = (active: boolean) =>
    `flex-1 rounded-md px-1 py-1.5 text-[10px] font-medium transition ${
      active
        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
        : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
    }`;

  return (
    <StyleCard
      title={`선택 스타일 · ${countLabel}`}
      actions={
        <MiniBtn onClick={clearCellOverrides} title="전역 기본으로 되돌리기">
          초기화
        </MiniBtn>
      }
    >
      <StyleTabBar tab={tab} onTab={setTab} showBorderDot={allBorderOn || borderMixed} />

      {tab === "fill" && (
        <div className="space-y-3">
          <ColorField
            label="셀 배경"
            value={cellFillValue}
            fallback={normalizeColorHex(gridStyle.cellFill, "#ffffff")}
            swatches={FILL_SWATCHES}
            onChange={(hex) => updateSelected(explicitCellFillOverride(gridStyle, hex))}
          />
          {!cellFillUniform ? (
            <p className="text-[9px] text-amber-600 dark:text-amber-400">선택 칸마다 배경색이 다릅니다.</p>
          ) : null}
          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50/80 px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-800/50">
            <span className="text-[10px] font-medium text-zinc-700 dark:text-zinc-200">셀 안 X 표시</span>
            <input
              type="checkbox"
              checked={targets.every((c) => {
                const grp = groupStyleForCell(c, groupStyles);
                return (c.cellDecoration ?? grp?.cellDecoration ?? "none") === "x";
              })}
              onChange={(e) =>
                updateSelected({ cellDecoration: e.target.checked ? "x" : undefined })
              }
              className="size-4 rounded border-zinc-300 accent-zinc-800"
            />
          </label>
        </div>
      )}

      {tab === "text" && (
        <div className="space-y-3">
          <ColorField
            label="글자색"
            value={textColorValue}
            fallback={normalizeColorHex(gridStyle.fontColor, "#0f172a")}
            swatches={TEXT_SWATCHES}
            onChange={(hex) => updateSelected(explicitTextColorOverride(gridStyle, hex))}
          />
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-300">
              글자 크기 {fontUniform ? "" : "(혼합)"}
            </span>
            <input
              type="number"
              min={0}
              max={48}
              placeholder={`기본 ${gridStyle.fontSize}`}
              value={fontInputValue}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  updateSelected({ fontSize: undefined });
                  return;
                }
                const n = parseNonNegInt(raw);
                if (n === null) return;
                updateSelected({ fontSize: clamp(n, 0, 48) });
              }}
              className="h-8 rounded-md border border-zinc-300 bg-white px-2 text-[11px] tabular-nums dark:border-zinc-600 dark:bg-zinc-900"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-300">가로</span>
              <div className="flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-600">
                {(["left", "center", "right"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => updateSelected({ alignH: v })}
                    className={segBtn(curAlignH === v)}
                  >
                    {v === "left" ? "좌" : v === "center" ? "중" : "우"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-300">세로</span>
              <div className="flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-600">
                {(["top", "middle", "bottom"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => updateSelected({ alignV: v })}
                    className={segBtn(curAlignV === v)}
                  >
                    {v === "top" ? "상" : v === "middle" ? "중" : "하"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "border" && (
        <div className="space-y-3">
          <ToggleRow
            label="테두리 표시"
            checked={allBorderOn}
            mixed={borderMixed}
            onChange={(on) =>
              updateSelected({
                showBorder: on,
                borderWidth: on ? DEFAULT_BORDER_WIDTH : 0,
                ...(!on ? { borderSides: undefined } : {}),
              })
            }
          />

          <div className="flex flex-wrap gap-1">
            <MiniBtn
              onClick={() =>
                updateSelected({ showBorder: false, borderWidth: 0, borderSides: undefined })
              }
            >
              선 끄기
            </MiniBtn>
            <MiniBtn
              onClick={() =>
                updateSelected({
                  showBorder: undefined,
                  borderColor: undefined,
                  borderWidth: undefined,
                  borderStyle: undefined,
                  borderSides: undefined,
                })
              }
            >
              전역 따르기
            </MiniBtn>
          </div>

          <ColorField
            label="선 색상"
            value={borderColorVal}
            fallback={DEFAULT_BORDER_COLOR}
            swatches={BORDER_SWATCHES}
            onChange={(hex) =>
              updateSelected(
                explicitBorderColorOverride(hex, Math.max(0, primary.borderWidth ?? DEFAULT_BORDER_WIDTH)),
              )
            }
          />

          <WidthSlider
            value={borderWidthVal}
            mixed={!borderWidthUniform}
            onChange={(bw) =>
              updateSelected({
                borderWidth: bw,
                ...(bw > 0 ? { showBorder: true } : { showBorder: false, borderSides: undefined }),
              })
            }
          />

          <LineStylePicker
            value={curBorderStyle}
            onChange={(v) => updateSelected({ borderStyle: v, showBorder: true })}
          />

          <BorderEdgePicker
            sides={sidesDisplay}
            mixed={edgeMixed}
            onToggle={(edge, on) => patchSelectedBorderSide(edge, on)}
            onPreset={(preset) => applySelectedBorderSidesPreset(preset)}
          />

          {groupCodeCommon ? (
            <div className="rounded-lg border border-dashed border-violet-200 bg-violet-50/50 p-2 dark:border-violet-900 dark:bg-violet-950/20">
              <p className="mb-2 text-[9px] font-medium text-violet-800 dark:text-violet-300">
                그룹「
                {groupCodeCommon.length > 20 ? `${groupCodeCommon.slice(0, 20)}…` : groupCodeCommon}
                」공통 테두리
              </p>
              <BorderEdgePicker
                sides={effectiveBorderSides(
                  EMPTY_GRID_ANCHOR,
                  gridStyle,
                  groupStyles[groupCodeCommon] ?? {},
                )}
                onToggle={(edge, on) => patchGroupBorderSide(groupCodeCommon, edge, on)}
                onPreset={(preset) => applyGroupBorderSidesPreset(groupCodeCommon, preset)}
              />
            </div>
          ) : null}
        </div>
      )}
    </StyleCard>
  );
}
