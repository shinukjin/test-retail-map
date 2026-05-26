"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ShelfKind, ShelfLayout } from "@/domain/types";
import { getSalesForShelfCode, loadSalesByShelfCode } from "@/lib/grid-sales-api";
import type { FloorImportModel } from "./useFloorImportModel";
import { ZoneSubdivideForm } from "@/experiments/_shared/ZoneSubdivideForm";

const KIND_LABELS: Record<ShelfKind, string> = {
  gondola: "곤돌라",
  refrigerated: "냉장",
  endcap: "앤드캡",
  produce: "신선",
  other: "기타",
};

const salesTable = loadSalesByShelfCode();

const STEPS = [
  { id: 1 as const, label: "업로드" },
  { id: 2 as const, label: "AI 분석" },
  { id: 3 as const, label: "영역 편집" },
  { id: 4 as const, label: "내보내기" },
];
type StepId = 1 | 2 | 3 | 4;

type SidePanelProps = {
  model: FloorImportModel;
  gridCols: number;
  gridRows: number;
  onGridColsChange: (v: number) => void;
  onGridRowsChange: (v: number) => void;
  onSendToGrid: () => void;
};

export function FloorImportSidePanel({
  model,
  gridCols,
  gridRows,
  onGridColsChange,
  onGridRowsChange,
  onSendToGrid,
}: SidePanelProps) {
  const {
    floorPlan,
    shelves,
    selectedId,
    status,
    errorMessage,
    analysisMeta,
    canUndo,
    canRedo,
    pdfTotalPages,
    pdfCurrentPage,
    aiProvider,
    setAiProvider,
    rawResponse,
    generatedSvg,
    uploadImage,
    loadPdfPage,
    analyzeWithAI,
    generateSvgWithAI,
    selectShelf,
    updateShelf,
    deleteShelf,
    addShelf,
    undo,
    redo,
    saveJson,
    importFromJson,
    loadFromStorage,
    subdivideShelf,
  } = model;

  const [step, setStep] = useState<StepId>(1);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonFileInputRef = useRef<HTMLInputElement>(null);
  const prevStatus = useRef(status);

  /* ─── 자동 스텝 전환 ─── */
  useEffect(() => {
    const prev = prevStatus.current;
    prevStatus.current = status;

    // 업로드/변환 완료 → 2단계(AI 분석)로
    if ((prev === "uploading" || prev === "converting") && status === "idle" && floorPlan) {
      setStep(2);
    }
    // AI 분석 완료 → 3단계(영역 편집)로
    if (prev === "analyzing" && status === "done") {
      setStep(3);
    }
  }, [status, floorPlan]);

  const canGoToStep = (s: StepId): boolean => {
    if (s === 1) return true;
    if (s === 2) return !!floorPlan;
    if (s === 3) return !!floorPlan;
    if (s === 4) return !!floorPlan;
    return false;
  };

  const completedStep = (s: StepId): boolean => {
    if (s === 1) return !!floorPlan;
    if (s === 2) return !!analysisMeta || shelves.length > 0;
    if (s === 3) return shelves.length > 0;
    return false;
  };

  const selected = selectedId ? shelves.find((s) => s.id === selectedId) : undefined;
  const unmapped = shelves.filter((s) => !s.bayCode?.trim());

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      await uploadImage(files[0]);
    },
    [uploadImage],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const handleAddShelf = () => {
    if (!floorPlan) return;
    const id = `shelf-${Date.now()}-new`;
    const shelf: ShelfLayout = {
      id,
      label: "새 매대",
      x: Math.round(floorPlan.width * 0.1),
      y: Math.round(floorPlan.height * 0.1),
      width: Math.round(floorPlan.width * 0.15),
      height: Math.round(floorPlan.height * 0.1),
      bayCode: "",
      kind: "gondola",
    };
    addShelf(shelf);
    selectShelf(id);
  };

  const handleJsonImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const ok = importFromJson(text);
      if (!ok) alert("올바른 FloorPlanSnapshot JSON 파일이 아닙니다.");
      else setStep(3);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const salesPreview = selected?.bayCode
    ? getSalesForShelfCode(salesTable, selected.bayCode)
    : undefined;

  const isBusy = status === "uploading" || status === "converting" || status === "analyzing";

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col overflow-hidden border-r border-zinc-200 bg-white text-sm dark:border-zinc-700 dark:bg-zinc-950">

      {/* ── 스텝 인디케이터 ── */}
      <div className="shrink-0 border-b border-zinc-100 px-3 py-3 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          {STEPS.map((s, i) => {
            const done = completedStep(s.id);
            const active = step === s.id;
            const locked = !canGoToStep(s.id);
            return (
              <div key={s.id} className="flex flex-1 items-center">
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => !locked && setStep(s.id)}
                  className="flex flex-col items-center gap-0.5 disabled:cursor-not-allowed"
                >
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold transition-all ${
                      active
                        ? "bg-blue-600 text-white shadow-md"
                        : done
                        ? "bg-emerald-500 text-white"
                        : "bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400"
                    }`}
                  >
                    {done && !active ? "✓" : s.id}
                  </div>
                  <span
                    className={`text-[9px] font-medium ${
                      active ? "text-blue-600" : done ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400"
                    }`}
                  >
                    {s.label}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <div
                    className={`mx-1 h-0.5 flex-1 rounded transition-all ${
                      completedStep(s.id) ? "bg-emerald-400" : "bg-zinc-200 dark:bg-zinc-700"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 스텝 컨텐츠 ── */}
      <div className="min-h-0 flex-1 overflow-y-auto">

        {/* STEP 1: 도면 업로드 */}
        {step === 1 && (
          <div className="flex flex-col gap-3 p-3">
            <StepTitle>도면 파일 업로드</StepTitle>

            {/* Drop zone */}
            <div
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition ${
                dragging
                  ? "border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/30"
                  : "border-zinc-300 hover:border-blue-300 hover:bg-blue-50/30 dark:border-zinc-600"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="text-3xl">🗺️</span>
              <p className="text-[11px] leading-relaxed text-zinc-500">
                PNG · JPG · PDF<br />DWG · DXF<br />
                <span className="mt-1 inline-block font-medium text-blue-500">드래그하거나 클릭</span>
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf,.dwg,.dxf"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />

            {/* 상태 */}
            {status === "uploading" && (
              <StatusCard color="blue" icon="⏳">파일 처리 중…</StatusCard>
            )}
            {status === "converting" && (
              <StatusCard color="amber" icon="🔄">DWG → PNG 변환 중…</StatusCard>
            )}
            {status === "error" && (
              <StatusCard color="red" icon="⚠️">{errorMessage}</StatusCard>
            )}

            {/* 업로드 성공 */}
            {floorPlan && status !== "uploading" && status !== "converting" && (
              <StatusCard color="emerald" icon="✅">
                {floorPlan.width} × {floorPlan.height}px
              </StatusCard>
            )}

            {/* PDF 페이지 선택 */}
            {pdfTotalPages && pdfTotalPages > 1 && (
              <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
                <span className="text-[10px] text-zinc-500">PDF 페이지</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => loadPdfPage(pdfCurrentPage - 1)}
                    disabled={pdfCurrentPage <= 1}
                    className="rounded px-2 py-0.5 text-[12px] hover:bg-zinc-200 disabled:opacity-30 dark:hover:bg-zinc-700"
                  >‹</button>
                  <span className="min-w-[40px] text-center text-[11px] font-medium tabular-nums">
                    {pdfCurrentPage} / {pdfTotalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => loadPdfPage(pdfCurrentPage + 1)}
                    disabled={pdfCurrentPage >= pdfTotalPages}
                    className="rounded px-2 py-0.5 text-[12px] hover:bg-zinc-200 disabled:opacity-30 dark:hover:bg-zinc-700"
                  >›</button>
                </div>
              </div>
            )}

            <div className="border-t border-zinc-100 pt-2 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => { loadFromStorage(); setStep(3); }}
                disabled={isBusy}
                className="w-full rounded-lg border border-zinc-200 py-1.5 text-[11px] text-zinc-500 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                이전 작업 불러오기
              </button>
            </div>

            {floorPlan && (
              <NextButton onClick={() => setStep(2)} label="다음: AI 분석" />
            )}
          </div>
        )}

        {/* STEP 2: AI 분석 */}
        {step === 2 && (
          <div className="flex flex-col gap-3 p-3">
            <StepTitle>AI 자동 분석</StepTitle>

            {/* 업로드 파일 요약 */}
            {floorPlan && (
              <div className="rounded-lg bg-zinc-50 px-3 py-2 text-[10px] text-zinc-500 dark:bg-zinc-900">
                📄 {floorPlan.width} × {floorPlan.height}px 도면 준비됨
              </div>
            )}

            {/* ─ 모드 A: 매대 영역 추출 ─ */}
            <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
              <p className="mb-2 text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">
                모드 A · 매대 영역 추출
              </p>
              <p className="mb-2 text-[10px] text-zinc-400">
                도면에서 매대 위치를 감지하여 편집 가능한 영역으로 추출합니다.
              </p>

              {/* AI 제공자 선택 */}
              <div className="mb-1 flex flex-col gap-0.5 rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
                {(
                  [
                    { id: "openai", label: "GPT-4o", desc: "OPENAI_API_KEY", badge: "권장" },
                    { id: "gemini", label: "Gemini 1.5 Pro", desc: "GOOGLE_VISION_API_KEY", badge: "도면 최적" },
                    { id: "google", label: "Google Vision", desc: "GOOGLE_VISION_API_KEY", badge: "사진 전용" },
                  ] as const
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setAiProvider(p.id)}
                    className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[10px] font-semibold transition ${
                      aiProvider === p.id
                        ? "bg-blue-600 text-white shadow"
                        : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <span className="flex-1">{p.label}</span>
                    <span className={`rounded px-1 py-0.5 text-[8px] font-bold ${
                      aiProvider === p.id
                        ? "bg-white/20 text-white"
                        : p.badge === "권장"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                          : p.badge === "도면 최적"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                            : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
                    }`}>
                      {p.badge}
                    </span>
                  </button>
                ))}
              </div>
              {aiProvider === "google" && (
                <p className="mb-1 rounded bg-amber-50 px-2 py-1 text-[9px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                  ⚠ Google Vision은 실물 사진 전용입니다. 도면 분석에는 Gemini를 사용하세요.
                </p>
              )}

              <button
                type="button"
                onClick={analyzeWithAI}
                disabled={!floorPlan || isBusy}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 text-[11px] font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {status === "analyzing" ? <><Spinner />분석 중…</> : "🔍 매대 영역 추출"}
              </button>
            </div>

            {/* ─ 모드 B: AI 이미지 생성 ─ */}
            <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
              <p className="mb-2 text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">
                모드 B · AI 이미지 생성
              </p>
              <p className="mb-2 text-[10px] text-zinc-400">
                도면을 참조해 GPT-4o가 새로운 2D 평면도 이미지를 생성합니다.
              </p>
              <button
                type="button"
                onClick={generateSvgWithAI}
                disabled={!floorPlan || isBusy}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 py-2 text-[11px] font-bold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {status === "analyzing" ? <><Spinner />생성 중…</> : "🎨 새 이미지 생성"}
              </button>
              {generatedSvg && (
                <p className="mt-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                  ✅ SVG 이미지 생성 완료 (캔버스 배경에 표시됨)
                </p>
              )}
            </div>

            {/* 오류 */}
            {status === "error" && (
              <StatusCard color="red" icon="⚠️">{errorMessage}</StatusCard>
            )}

            {/* 결과 요약 */}
            {analysisMeta && (
              <StatusCard color="emerald" icon="✅">
                {analysisMeta.model} · <strong>{shelves.length}개</strong> 매대 감지
                <br />
                <span className="text-[9px] opacity-70">
                  {new Date(analysisMeta.analyzedAt).toLocaleString("ko-KR")}
                </span>
              </StatusCard>
            )}

            {/* ─ AI 원본 응답 (디버그) ─ */}
            {rawResponse && (
              <details className="rounded-lg border border-zinc-200 dark:border-zinc-700">
                <summary className="cursor-pointer px-3 py-2 text-[10px] font-semibold text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                  🔎 AI 원본 응답 보기
                </summary>
                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-all px-3 pb-3 pt-1 text-[9px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {rawResponse}
                </pre>
              </details>
            )}

            <div className="border-t border-zinc-100 pt-2 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="w-full rounded-lg border border-zinc-200 py-1.5 text-[11px] text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                AI 분석 없이 직접 편집 →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: 영역 편집 */}
        {step === 3 && (
          <div className="flex flex-col gap-0">
            {/* Undo/Redo + 통계 바 */}
            <div className="flex items-center gap-1 border-b border-zinc-100 px-2 py-1.5 dark:border-zinc-800">
              <button
                type="button"
                onClick={undo}
                disabled={!canUndo}
                title="되돌리기 (Ctrl+Z)"
                className="rounded p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
              >↩</button>
              <button
                type="button"
                onClick={redo}
                disabled={!canRedo}
                title="다시실행 (Ctrl+Y)"
                className="rounded p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
              >↪</button>
              <span className="ml-auto text-[10px] text-zinc-400">
                {shelves.length}개 영역
                {unmapped.length > 0 && (
                  <span className="ml-1 rounded bg-amber-100 px-1 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    미매핑 {unmapped.length}
                  </span>
                )}
              </span>
            </div>

            <div className="flex flex-col gap-3 p-3">
              {/* 영역 목록 */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">영역 목록</p>
                  <button
                    type="button"
                    onClick={handleAddShelf}
                    disabled={!floorPlan}
                    className="rounded bg-blue-50 px-2 py-0.5 text-[10px] text-blue-600 hover:bg-blue-100 disabled:opacity-40 dark:bg-blue-950/30 dark:text-blue-400"
                  >
                    + 추가
                  </button>
                </div>

                {shelves.length === 0 ? (
                  <p className="rounded-lg bg-zinc-50 py-3 text-center text-[11px] text-zinc-400 dark:bg-zinc-900">
                    영역 없음.<br />AI 분석 또는 직접 추가하세요.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-0.5 rounded-lg border border-zinc-100 dark:border-zinc-800">
                    {shelves.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => selectShelf(s.id)}
                          className={`w-full rounded px-2 py-1.5 text-left text-[11px] transition ${
                            s.id === selectedId
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                              : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                          }`}
                        >
                          <span className="font-semibold">
                            {s.bayCode || <span className="text-amber-500">미매핑</span>}
                          </span>
                          <span className="ml-1 text-zinc-400">{s.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* 영역 속성 */}
              {selected && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 dark:border-blue-800/40 dark:bg-blue-950/20">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                    선택된 영역
                  </p>
                  <div className="flex flex-col gap-2">
                    <Field label="매대 코드 (bayCode)">
                      <input
                        type="text"
                        value={selected.bayCode ?? ""}
                        onChange={(e) => updateShelf(selected.id, { bayCode: e.target.value })}
                        placeholder="A1"
                        className={inputCls}
                      />
                      {salesPreview && (
                        <p className="mt-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                          매출 {salesPreview.total.toLocaleString()}원
                        </p>
                      )}
                    </Field>
                    <Field label="이름 (label)">
                      <input
                        type="text"
                        value={selected.label}
                        onChange={(e) => updateShelf(selected.id, { label: e.target.value })}
                        placeholder="음료"
                        className={inputCls}
                      />
                    </Field>
                    <Field label="구역 코드">
                      <input
                        type="text"
                        value={selected.sectionCode ?? ""}
                        onChange={(e) => updateShelf(selected.id, { sectionCode: e.target.value })}
                        placeholder="S1"
                        className={inputCls}
                      />
                    </Field>
                    <Field label="종류">
                      <select
                        value={selected.kind ?? "gondola"}
                        onChange={(e) => updateShelf(selected.id, { kind: e.target.value as ShelfKind })}
                        className={inputCls}
                      >
                        {Object.entries(KIND_LABELS).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="카테고리">
                      <input
                        type="text"
                        value={selected.category ?? ""}
                        onChange={(e) => updateShelf(selected.id, { category: e.target.value })}
                        placeholder="식품, 음료, 냉장·냉동…"
                        className={inputCls}
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="진열단 수">
                        <input
                          type="number"
                          min={1} max={6}
                          value={selected.tierCount ?? ""}
                          onChange={(e) => updateShelf(selected.id, { tierCount: Number(e.target.value) || undefined })}
                          placeholder="4"
                          className={inputCls}
                        />
                      </Field>
                      <Field label="방향">
                        <select
                          value={selected.orientation ?? ""}
                          onChange={(e) => updateShelf(selected.id, { orientation: (e.target.value as "H" | "V") || undefined })}
                          className={inputCls}
                        >
                          <option value="">-</option>
                          <option value="H">가로 (H)</option>
                          <option value="V">세로 (V)</option>
                        </select>
                      </Field>
                    </div>
                    {selected.detectedText && (
                      <div className="rounded bg-zinc-50 px-2 py-1.5 text-[10px] text-zinc-500 dark:bg-zinc-900">
                        🔤 감지 텍스트: <span className="font-medium text-zinc-700 dark:text-zinc-300">{selected.detectedText}</span>
                      </div>
                    )}
                    {selected.confidence !== undefined && (
                      <div className="text-[10px] text-zinc-400">
                        신뢰도: {Math.round(selected.confidence * 100)}%
                      </div>
                    )}
                    <Field label="위치 / 크기">
                      <div className="grid grid-cols-2 gap-1">
                        {(["x", "y", "width", "height"] as const).map((k) => (
                          <div key={k} className="flex items-center gap-1">
                            <span className="w-8 shrink-0 text-[10px] text-zinc-400">{k}</span>
                            <input
                              type="number"
                              value={selected[k]}
                              onChange={(e) => updateShelf(selected.id, { [k]: Number(e.target.value) })}
                              className="w-full rounded border border-zinc-200 px-1 py-0.5 text-[10px] dark:border-zinc-700 dark:bg-zinc-900"
                            />
                          </div>
                        ))}
                      </div>
                    </Field>
                    <ZoneSubdivideForm
                      title="영역 세분화"
                      parent={{
                        code: selected.sectionCode ?? "",
                        label: selected.label,
                        bayCode: selected.bayCode ?? "",
                      }}
                      spanCols={1}
                      spanRows={1}
                      enforceSpanLimit={false}
                      maxSubdivCols={8}
                      maxSubdivRows={8}
                      labels={{
                        code: "하위 구역 코드",
                        label: "영역 이름",
                        bay: "매대 코드",
                      }}
                      onApply={(subdivCols, subdivRows, entries) =>
                        subdivideShelf(selected.id, subdivCols, subdivRows, entries)
                      }
                    />
                    <button
                      type="button"
                      onClick={() => deleteShelf(selected.id)}
                      className="rounded-lg bg-red-50 py-1.5 text-[11px] text-red-500 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-400"
                    >
                      영역 삭제
                    </button>
                  </div>
                </div>
              )}

              <NextButton onClick={() => setStep(4)} label="다음: 내보내기" disabled={shelves.length === 0} />
            </div>
          </div>
        )}

        {/* STEP 4: 내보내기 */}
        {step === 4 && (
          <div className="flex flex-col gap-3 p-3">
            <StepTitle>내보내기</StepTitle>

            {/* 완료 요약 */}
            <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/20">
              <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                ✅ 작업 완료
              </p>
              <p className="mt-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                매대 {shelves.length}개 · 미매핑 {unmapped.length}개
              </p>
            </div>

            {/* Konva 편집기로 내보내기 */}
            <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
              <p className="mb-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">Konva 격자 편집기</p>
              <p className="mb-2 text-[10px] text-zinc-400">격자 크기를 지정하면 도면 영역을 셀로 변환합니다.</p>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <label className="w-10 shrink-0 text-[11px] text-zinc-500">열 수</label>
                  <input
                    type="number" min={1} max={100} value={gridCols}
                    onChange={(e) => onGridColsChange(Number(e.target.value))}
                    className={inputCls + " w-20"}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="w-10 shrink-0 text-[11px] text-zinc-500">행 수</label>
                  <input
                    type="number" min={1} max={100} value={gridRows}
                    onChange={(e) => onGridRowsChange(Number(e.target.value))}
                    className={inputCls + " w-20"}
                  />
                </div>
                <button
                  type="button"
                  onClick={onSendToGrid}
                  disabled={!floorPlan || shelves.length === 0}
                  className="mt-1 rounded-xl bg-indigo-600 py-2.5 text-[12px] font-bold text-white shadow hover:bg-indigo-700 disabled:opacity-40"
                >
                  📐 Konva 편집기로 보내기
                </button>
              </div>
            </div>

            {/* JSON 저장/불러오기 */}
            <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
              <p className="mb-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">JSON 파일</p>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={saveJson}
                  disabled={!floorPlan}
                  className="rounded-lg border border-zinc-300 py-1.5 text-[11px] hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-900"
                >
                  ⬇ JSON 내보내기
                </button>
                <button
                  type="button"
                  onClick={() => jsonFileInputRef.current?.click()}
                  className="rounded-lg border border-zinc-300 py-1.5 text-[11px] hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                >
                  ⬆ JSON 불러오기
                </button>
                <input
                  ref={jsonFileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleJsonImport}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setStep(3)}
              className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              ← 영역 편집으로 돌아가기
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

/* ─── 공통 UI 컴포넌트 ─── */

function StepTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[12px] font-bold text-zinc-700 dark:text-zinc-200">{children}</h2>
  );
}

function NextButton({
  onClick,
  label,
  disabled,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-1 rounded-xl bg-blue-600 py-2.5 text-[12px] font-bold text-white shadow hover:bg-blue-700 disabled:opacity-40"
    >
      {label} →
    </button>
  );
}

function StatusCard({
  color,
  icon,
  children,
}: {
  color: "blue" | "amber" | "red" | "emerald";
  icon: string;
  children: React.ReactNode;
}) {
  const cls = {
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
    red: "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400",
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
  }[color];
  return (
    <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-[11px] ${cls}`}>
      <span className="shrink-0">{icon}</span>
      <span className="leading-snug">{children}</span>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] font-medium text-zinc-400">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded border border-zinc-200 px-2 py-1 text-[11px] outline-none focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
