"use client";

import type { ReactNode } from "react";
import { normalizeColorHex } from "@/experiments/konva/grid-editor-cell-draw";
import type { BorderLineStyle, BorderSides } from "@/experiments/konva/grid-editor-types";
import { BORDER_PRESET_SIDES } from "./border-presets";

export const FILL_SWATCHES = [
  "#ffffff",
  "#fef9c3",
  "#dbeafe",
  "#dcfce7",
  "#fce7f3",
  "#ffedd5",
  "#f3f4f6",
  "#e2e8f0",
  "#1e293b",
  "#7f1d1d",
] as const;

export const BORDER_SWATCHES = [
  "#94a3b8",
  "#0f172a",
  "#64748b",
  "#dc2626",
  "#2563eb",
  "#16a34a",
  "#ca8a04",
  "#9333ea",
] as const;

export const TEXT_SWATCHES = ["#0f172a", "#ffffff", "#1e40af", "#b91c1c", "#15803d", "#64748b"] as const;

const BORDER_STYLE_LABELS: Record<BorderLineStyle, string> = {
  solid: "실선",
  dashed: "파선",
  dotted: "점선",
};

const BORDER_PRESET_ORDER = ["all", "lr", "tb", "none"] as const;
const BORDER_PRESET_LABELS: Record<(typeof BORDER_PRESET_ORDER)[number], string> = {
  all: "사면",
  lr: "좌우",
  tb: "상하",
  none: "없음",
};

type ColorFieldProps = {
  label: string;
  value: string;
  fallback: string;
  swatches?: readonly string[];
  onChange: (hex: string) => void;
};

/** 색상 스와치 + HEX 입력 + 프리셋 팔레트 */
export function ColorField({ label, value, fallback, swatches = FILL_SWATCHES, onChange }: ColorFieldProps) {
  const hex = normalizeColorHex(value, fallback);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-300">{label}</span>
      <div className="flex items-center gap-1.5">
        <label className="relative block shrink-0 cursor-pointer">
          <span
            className="block size-8 rounded-lg border-2 border-zinc-200 shadow-inner ring-1 ring-zinc-900/5 dark:border-zinc-600"
            style={{ backgroundColor: hex }}
          />
          <input
            type="color"
            value={hex}
            onChange={(e) => onChange(normalizeColorHex(e.target.value, fallback))}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={`${label} 색상 선택`}
          />
        </label>
        <input
          type="text"
          value={hex}
          spellCheck={false}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (/^#[0-9a-fA-F]{0,6}$/.test(raw) || raw === "") {
              if (raw.length === 7) onChange(normalizeColorHex(raw, fallback));
            }
          }}
          onBlur={(e) => onChange(normalizeColorHex(e.target.value, fallback))}
          className="h-8 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 font-mono text-[10px] uppercase tabular-nums shadow-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-400/40 dark:border-zinc-600 dark:bg-zinc-900"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {swatches.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => onChange(c)}
            className={`size-5 rounded-md border transition hover:scale-110 active:scale-95 ${
              hex.toLowerCase() === c.toLowerCase()
                ? "border-sky-500 ring-2 ring-sky-400/50"
                : "border-zinc-200 dark:border-zinc-600"
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </div>
  );
}

type BorderEdgePickerProps = {
  sides: BorderSides;
  mixed?: Partial<Record<keyof BorderSides, boolean>>;
  onToggle: (edge: keyof BorderSides, on: boolean) => void;
  onPreset: (preset: (typeof BORDER_PRESET_ORDER)[number]) => void;
};

/** 클릭 가능한 미니 박스로 테두리 면 선택 */
export function BorderEdgePicker({ sides, mixed, onToggle, onPreset }: BorderEdgePickerProps) {
  const edgeBtn = (edge: keyof BorderSides, className: string, label: string) => {
    const isMixed = mixed?.[edge];
    const on = sides[edge];
    return (
      <button
        key={edge}
        type="button"
        title={`${label} ${on ? "끄기" : "켜기"}`}
        aria-pressed={on}
        onClick={() => onToggle(edge, !on)}
        className={`absolute transition ${className} ${
          on
            ? "bg-sky-500 opacity-100 shadow-sm"
            : isMixed
              ? "bg-amber-400 opacity-80"
              : "bg-zinc-200 opacity-60 hover:bg-zinc-300 dark:bg-zinc-600 dark:hover:bg-zinc-500"
        }`}
      />
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-300">테두리 면</span>
      <div className="flex items-start gap-3">
        <div className="relative size-14 shrink-0 rounded-md bg-white shadow-inner ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-600">
          {edgeBtn("top", "left-1 right-1 top-0 h-2 rounded-t-sm", "상")}
          {edgeBtn("bottom", "bottom-0 left-1 right-1 h-2 rounded-b-sm", "하")}
          {edgeBtn("left", "bottom-1 left-0 top-1 w-2 rounded-l-sm", "좌")}
          {edgeBtn("right", "bottom-1 right-0 top-1 w-2 rounded-r-sm", "우")}
          <div className="absolute inset-3 rounded-sm border border-dashed border-zinc-300 dark:border-zinc-500" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="grid grid-cols-2 gap-1">
            {BORDER_PRESET_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => onPreset(key)}
                className="rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-[9px] font-medium text-zinc-700 transition hover:border-sky-300 hover:bg-sky-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-sky-700 dark:hover:bg-sky-950/40"
              >
                {BORDER_PRESET_LABELS[key]}
              </button>
            ))}
          </div>
          <p className="text-[8px] leading-snug text-zinc-400">박스 가장자리를 클릭해 면을 켜거나 끕니다.</p>
        </div>
      </div>
    </div>
  );
}

type LineStylePickerProps = {
  value: BorderLineStyle | null;
  onChange: (v: BorderLineStyle) => void;
};

export function LineStylePicker({ value, onChange }: LineStylePickerProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-300">선 종류</span>
      <div className="flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-600">
        {(["solid", "dashed", "dotted"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`flex-1 rounded-md px-1 py-1.5 text-[10px] font-medium transition ${
              value === v
                ? "bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            {BORDER_STYLE_LABELS[v]}
          </button>
        ))}
      </div>
    </div>
  );
}

type WidthSliderProps = {
  label?: string;
  value: number;
  mixed?: boolean;
  onChange: (n: number) => void;
  max?: number;
};

export function WidthSlider({ label = "두께", value, mixed, onChange, max = 8 }: WidthSliderProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-300">{label}</span>
        <span className="font-mono text-[10px] tabular-nums text-zinc-500">
          {mixed ? "혼합" : `${value}px`}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={mixed ? 0 : value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer accent-sky-600"
      />
    </div>
  );
}

type StyleTab = "fill" | "border" | "text";

export type { StyleTab };

export function StyleTabBar({
  tab,
  onTab,
  showBorderDot,
}: {
  tab: StyleTab;
  onTab: (t: StyleTab) => void;
  showBorderDot?: boolean;
}) {
  const tabs: { id: StyleTab; label: string }[] = [
    { id: "fill", label: "채우기" },
    { id: "border", label: "테두리" },
    { id: "text", label: "글자" },
  ];
  return (
    <div className="flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800/80">
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onTab(id)}
          className={`relative flex-1 rounded-md px-2 py-1.5 text-[10px] font-semibold transition ${
            tab === id
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-50"
              : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          }`}
        >
          {label}
          {id === "border" && showBorderDot ? (
            <span className="absolute right-1 top-1 size-1.5 rounded-full bg-sky-500" />
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function StyleCard({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-2.5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/90">
      {(title || actions) && (
        <div className="mb-2 flex items-center justify-between gap-2">
          {title ? <h3 className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-100">{title}</h3> : <span />}
          {actions}
        </div>
      )}
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export function ToggleRow({
  label,
  checked,
  mixed,
  onChange,
}: {
  label: string;
  checked: boolean;
  mixed?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-zinc-100 bg-zinc-50/80 px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-800/50">
      <span className="text-[10px] font-medium text-zinc-700 dark:text-zinc-200">
        {label}
        {mixed ? <span className="ml-1 text-[9px] font-normal text-amber-600 dark:text-amber-400">(혼합)</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${
          checked ? "bg-sky-500" : mixed ? "bg-amber-400" : "bg-zinc-300 dark:bg-zinc-600"
        }`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition ${
            checked || mixed ? "left-4" : "left-0.5"
          }`}
        />
      </button>
    </label>
  );
}

export function MiniBtn({
  children,
  onClick,
  variant = "line",
  disabled,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: "line" | "solid";
  disabled?: boolean;
  title?: string;
}) {
  const cls =
    variant === "solid"
      ? "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
      : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200";
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-[9px] font-medium transition active:scale-[0.98] disabled:opacity-40 ${cls}`}
    >
      {children}
    </button>
  );
}

export { BORDER_PRESET_SIDES, BORDER_PRESET_ORDER };
