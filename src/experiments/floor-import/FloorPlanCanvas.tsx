"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Konva from "konva";
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from "react-konva";
import type { ShelfLayout } from "@/domain/types";
import type { FloorImportModel } from "./useFloorImportModel";

/* ─── 이미지 로더 ─── */
function useFloorImage(url: string): HTMLImageElement | undefined {
  const [loaded, setLoaded] = useState<{ url: string; image: HTMLImageElement } | null>(null);
  useEffect(() => {
    if (!url) return;
    const img = new Image();
    img.onload = () => setLoaded({ url, image: img });
    if (!url.startsWith("data:") && !url.startsWith("blob:")) img.crossOrigin = "anonymous";
    img.src = url;
    return () => { img.onload = null; img.onerror = null; };
  }, [url]);
  return loaded?.url === url ? loaded.image : undefined;
}

/* ─── 상수 ─── */
const ZOOM_MIN = 0.05;
const ZOOM_MAX = 10;
const ZOOM_STEP = 1.25; // 버튼 한 번에 25% 변화

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

/* ─── 매대 스타일 ─── */
const KIND_STYLE: Record<string, { fill: string; stroke: string; label: string }> = {
  gondola:      { fill: "#1d4ed8", stroke: "#1e40af", label: "#fff" },
  refrigerated: { fill: "#0891b2", stroke: "#0e7490", label: "#fff" },
  endcap:       { fill: "#c2410c", stroke: "#9a3412", label: "#fff" },
  produce:      { fill: "#15803d", stroke: "#166534", label: "#fff" },
  checkout:     { fill: "#d97706", stroke: "#b45309", label: "#fff" },
  storage:      { fill: "#64748b", stroke: "#475569", label: "#fff" },
  other:        { fill: "#6d28d9", stroke: "#5b21b6", label: "#fff" },
};

function kindStyle(shelf: ShelfLayout) {
  return KIND_STYLE[shelf.kind ?? "gondola"] ?? KIND_STYLE.other;
}

/* ─── 격자선 ─── */
function FloorGrid({ width, height }: { width: number; height: number }) {
  const step = 50;
  const nodes: React.ReactNode[] = [];
  for (let x = step; x < width; x += step)
    nodes.push(<Rect key={`v${x}`} x={x} y={0} width={0.5} height={height} fill="#cbd5e1" listening={false} />);
  for (let y = step; y < height; y += step)
    nodes.push(<Rect key={`h${y}`} x={0} y={y} width={width} height={0.5} fill="#cbd5e1" listening={false} />);
  return <>{nodes}</>;
}

/* ─── 매대 사각형 ─── */
const ShelfRect = memo(
  function ShelfRect({ shelf, isSelected, onSelect }: {
    shelf: ShelfLayout; isSelected: boolean; onSelect: (id: string) => void;
  }) {
    const { fill, stroke, label } = kindStyle(shelf);
    const fontSize = Math.max(8, Math.min(13, shelf.width / 7));
    return (
      <Group name={`shelf-${shelf.id}`} id={shelf.id} x={shelf.x} y={shelf.y}
        draggable={false} onClick={() => onSelect(shelf.id)} onTap={() => onSelect(shelf.id)}>
        <Rect width={shelf.width} height={shelf.height} fill={fill}
          stroke={isSelected ? "#f59e0b" : stroke} strokeWidth={isSelected ? 3 : 1.5}
          cornerRadius={2} listening />
        {isSelected && (
          <Rect width={shelf.width} height={shelf.height} fill="rgba(245,158,11,0.18)"
            cornerRadius={2} listening={false} />
        )}
        <Text
          text={shelf.bayCode ? `${shelf.bayCode}\n${shelf.label}` : shelf.label}
          fontSize={fontSize} fill={label} fontStyle="bold"
          width={shelf.width - 4} height={shelf.height - 4}
          x={2} y={2} align="center" verticalAlign="middle" wrap="word" listening={false}
        />
      </Group>
    );
  },
  (a, b) => a.shelf === b.shelf && a.isSelected === b.isSelected,
);

/* ─── 범례 ─── */
const LEGEND_ITEMS = Object.entries(KIND_STYLE).map(([kind, s]) => ({ kind, ...s }));
const KIND_LABEL_MAP: Record<string, string> = {
  gondola: "곤돌라", refrigerated: "냉장", endcap: "엔드캡",
  produce: "신선", checkout: "계산대", storage: "창고", other: "기타",
};

function Legend() {
  return (
    <div className="absolute right-3 top-3 flex flex-col gap-1 rounded-lg border border-zinc-700 bg-zinc-900/85 px-3 py-2 text-[11px] backdrop-blur">
      {LEGEND_ITEMS.map(({ kind, fill }) => (
        <div key={kind} className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: fill }} />
          <span className="text-zinc-300">{KIND_LABEL_MAP[kind] ?? kind}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── 줌 컨트롤 버튼 ─── */
function ZoomControls({
  scale, onZoomIn, onZoomOut, onFit, onReset,
}: {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onReset: () => void;
}) {
  const pct = Math.round(scale * 100);
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-xl border border-zinc-600 bg-zinc-900/90 px-2 py-1.5 backdrop-blur select-none">
      <CtrlBtn onClick={onZoomOut} title="축소 (−)">−</CtrlBtn>
      <button
        type="button"
        onClick={onFit}
        title="화면에 맞추기"
        className="min-w-[52px] rounded-lg px-2 py-1 text-[11px] font-mono font-semibold text-zinc-200 hover:bg-zinc-700 transition"
      >
        {pct}%
      </button>
      <CtrlBtn onClick={onZoomIn} title="확대 (+)">+</CtrlBtn>
      <div className="mx-1 h-4 w-px bg-zinc-600" />
      <CtrlBtn onClick={onFit} title="화면에 맞추기">⊡</CtrlBtn>
      <CtrlBtn onClick={onReset} title="100% 크기로">1:1</CtrlBtn>
    </div>
  );
}

function CtrlBtn({ onClick, title, children }: {
  onClick: () => void; title: string; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} title={title}
      className="flex h-7 min-w-[28px] items-center justify-center rounded-lg px-1.5 text-[13px] font-bold text-zinc-200 hover:bg-zinc-700 transition">
      {children}
    </button>
  );
}

/* ─── SVG → data URL ─── */
function svgToDataUrl(svg: string): string {
  return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
}

/* ─── 메인 컴포넌트 ─── */
type Props = {
  model: FloorImportModel;
  onShelfDragEnd: (id: string, x: number, y: number) => void;
  onShelfTransformEnd: (id: string, x: number, y: number, w: number, h: number) => void;
};

export function FloorPlanCanvas({ model, onShelfDragEnd, onShelfTransformEnd }: Props) {
  const { floorPlan, shelves, selectedId, selectShelf, generatedSvg } = model;

  const svgDataUrl = generatedSvg ? svgToDataUrl(generatedSvg) : "";
  const svgImage = useFloorImage(svgDataUrl);

  const [viewport, setViewport] = useState({ w: 800, h: 600 });
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);

  const panRef = useRef<{
    pointerId: number;
    startX: number; startY: number;
    lastX: number; lastY: number;
    moved: boolean;
  } | null>(null);

  const pinchRef = useRef<{ dist: number } | null>(null);

  /* viewport 크기 감지 */
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const sync = () => {
      const r = el.getBoundingClientRect();
      setViewport({ w: Math.floor(r.width), h: Math.floor(r.height) });
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* 도면 로드 시 fit */
  const fitToScreen = useCallback(() => {
    if (!floorPlan || viewport.w <= 0 || viewport.h <= 0) return;
    const sx = viewport.w / floorPlan.width;
    const sy = viewport.h / floorPlan.height;
    const scale = clamp(Math.min(sx, sy) * 0.92, ZOOM_MIN, ZOOM_MAX);
    const x = (viewport.w - floorPlan.width * scale) / 2;
    const y = (viewport.h - floorPlan.height * scale) / 2;
    setTransform({ scale, x, y });
  }, [floorPlan, viewport.w, viewport.h]);

  useLayoutEffect(() => {
    queueMicrotask(fitToScreen);
  }, [fitToScreen]);

  /* Transformer 연결 */
  useLayoutEffect(() => {
    const tr = transformerRef.current;
    const stage = stageRef.current;
    if (!tr || !stage || !selectedId) { tr?.nodes([]); return; }
    const node = stage.findOne(`#${selectedId}`);
    if (node) { tr.nodes([node]); tr.getLayer()?.batchDraw(); }
    else tr.nodes([]);
  }, [selectedId]);

  /* 1:1 리셋 */
  const resetZoom = useCallback(() => {
    if (!floorPlan) return;
    const x = (viewport.w - floorPlan.width) / 2;
    const y = (viewport.h - floorPlan.height) / 2;
    setTransform({ scale: 1, x, y });
  }, [floorPlan, viewport.w, viewport.h]);

  /* 줌 버튼 */
  const zoomBy = useCallback((factor: number) => {
    setTransform((prev) => {
      const cx = viewport.w / 2;
      const cy = viewport.h / 2;
      const ns = clamp(prev.scale * factor, ZOOM_MIN, ZOOM_MAX);
      const mx = (cx - prev.x) / prev.scale;
      const my = (cy - prev.y) / prev.scale;
      return { scale: ns, x: cx - mx * ns, y: cy - my * ns };
    });
  }, [viewport.w, viewport.h]);

  /* 스페이스바 */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  /* 휠 줌 (부드러운 속도) */
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;
    const ptr = stage.getPointerPosition();
    if (!ptr) return;
    // ctrlKey = 핀치 투 줌 (trackpad), 일반 휠
    const delta = e.evt.ctrlKey ? e.evt.deltaY * 0.01 : e.evt.deltaY * 0.001;
    const factor = Math.pow(0.999, delta * 60);
    setTransform((prev) => {
      const mx = (ptr.x - prev.x) / prev.scale;
      const my = (ptr.y - prev.y) / prev.scale;
      const ns = clamp(prev.scale * factor, ZOOM_MIN, ZOOM_MAX);
      return { scale: ns, x: ptr.x - mx * ns, y: ptr.y - my * ns };
    });
  }, []);

  /* 포인터 이벤트 (패닝) */
  useLayoutEffect(() => {
    const container = stageRef.current?.container();
    if (!container) return;

    const startPan = (e: PointerEvent) => {
      panRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX, startY: e.clientY,
        lastX: e.clientX, lastY: e.clientY,
        moved: false,
      };
      try { container.setPointerCapture(e.pointerId); } catch { /* */ }
      setIsPanning(true);
    };

    const onDown = (e: PointerEvent) => {
      // 중간 버튼 또는 스페이스+좌클릭 → 무조건 패닝
      if (e.button === 1) { e.preventDefault(); startPan(e); return; }
      if (e.button !== 0) return;
      if (spaceHeld) { e.preventDefault(); startPan(e); return; }

      // 좌클릭: 셀프 위면 Konva가 처리, 빈 공간이면 패닝
      const st = stageRef.current;
      const pos = st?.getPointerPosition();
      const hit = pos ? st?.getIntersection(pos) : null;
      const hitName = hit?.name?.() ?? "";
      if (!hitName.startsWith("shelf-")) {
        e.preventDefault();
        startPan(e);
      }
    };

    const onMove = (e: PointerEvent) => {
      const d = panRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const dx = e.clientX - d.lastX;
      const dy = e.clientY - d.lastY;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) d.moved = true;
      d.lastX = e.clientX;
      d.lastY = e.clientY;
      setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
    };

    const onUp = (e: PointerEvent) => {
      const d = panRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      try { container.releasePointerCapture(e.pointerId); } catch { /* */ }
      if (!d.moved) selectShelf(null);
      panRef.current = null;
      setIsPanning(false);
    };

    // 터치 핀치 줌
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchRef.current = { dist: Math.hypot(dx, dy) };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinchRef.current) return;
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const newDist = Math.hypot(dx, dy);
      const factor = newDist / pinchRef.current.dist;
      pinchRef.current.dist = newDist;
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const rect = container.getBoundingClientRect();
      const px = cx - rect.left;
      const py = cy - rect.top;
      setTransform((prev) => {
        const mx = (px - prev.x) / prev.scale;
        const my = (py - prev.y) / prev.scale;
        const ns = clamp(prev.scale * factor, ZOOM_MIN, ZOOM_MAX);
        return { scale: ns, x: px - mx * ns, y: py - my * ns };
      });
    };
    const onTouchEnd = () => { pinchRef.current = null; };

    container.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    container.addEventListener("touchstart", onTouchStart, { passive: false });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd);

    return () => {
      container.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
    };
  }, [selectShelf, spaceHeld]);

  /* Transformer */
  const handleTransformEnd = useCallback(() => {
    const tr = transformerRef.current;
    if (!tr || !selectedId) return;
    const node = tr.nodes()[0];
    if (!node) return;
    const scaleX = node.scaleX(); const scaleY = node.scaleY();
    const newW = Math.round((node.width() as number) * scaleX);
    const newH = Math.round((node.height() as number) * scaleY);
    node.scaleX(1); node.scaleY(1);
    onShelfTransformEnd(selectedId, Math.round(node.x()), Math.round(node.y()), newW, newH);
  }, [selectedId, onShelfTransformEnd]);

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>, shelfId: string) => {
      onShelfDragEnd(shelfId, Math.round(e.target.x()), Math.round(e.target.y()));
    },
    [onShelfDragEnd],
  );

  /* 빈 화면 */
  if (!floorPlan) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-zinc-400">
        <span className="text-4xl opacity-40">🗺️</span>
        왼쪽 패널에서 도면을 업로드하세요.
      </div>
    );
  }

  /* 커서 */
  const cursor = isPanning ? "grabbing" : spaceHeld ? "grab" : "default";

  return (
    <div
      ref={viewportRef}
      className="relative h-full w-full overflow-hidden bg-slate-700"
      style={{ cursor }}
    >
      <Stage ref={stageRef} width={viewport.w} height={viewport.h} onWheel={handleWheel}>
        {/* Layer 0: 배경 */}
        <Layer listening={false}>
          <Group x={transform.x} y={transform.y} scaleX={transform.scale} scaleY={transform.scale}>
            {generatedSvg && svgImage ? (
              <KonvaImage image={svgImage} x={0} y={0}
                width={floorPlan.width} height={floorPlan.height} listening={false} />
            ) : (
              <>
                <Rect x={0} y={0} width={floorPlan.width} height={floorPlan.height} fill="#f1f5f9" listening={false} />
                <FloorGrid width={floorPlan.width} height={floorPlan.height} />
                <Rect x={0} y={0} width={floorPlan.width} height={floorPlan.height}
                  fill="transparent" stroke="#475569" strokeWidth={4} listening={false} />
              </>
            )}
          </Group>
        </Layer>

        {/* Layer 1: 매대 */}
        <Layer>
          <Group x={transform.x} y={transform.y} scaleX={transform.scale} scaleY={transform.scale}>
            {shelves.map((shelf) => (
              <ShelfRect key={shelf.id} shelf={shelf}
                isSelected={shelf.id === selectedId} onSelect={selectShelf} />
            ))}
          </Group>
        </Layer>

        {/* Layer 2: Transformer */}
        <Layer>
          <Group x={transform.x} y={transform.y} scaleX={transform.scale} scaleY={transform.scale}>
            <Transformer ref={transformerRef} rotateEnabled={false} keepRatio={false}
              anchorSize={8} anchorFill="#fff" anchorStroke="#f59e0b" borderStroke="#f59e0b"
              onTransformEnd={handleTransformEnd}
              onDragEnd={(e) => {
                if (selectedId) handleDragEnd(e as Konva.KonvaEventObject<DragEvent>, selectedId);
              }} />
          </Group>
        </Layer>
      </Stage>

      {/* 범례 */}
      {shelves.length > 0 && <Legend />}

      {/* 분석 전 안내 */}
      {shelves.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded-lg bg-black/40 px-4 py-2 text-sm text-white backdrop-blur-sm">
            AI 분석 버튼을 클릭하면 매대가 자동으로 그려집니다
          </p>
        </div>
      )}

      {/* 줌 컨트롤 */}
      <ZoomControls
        scale={transform.scale}
        onZoomIn={() => zoomBy(ZOOM_STEP)}
        onZoomOut={() => zoomBy(1 / ZOOM_STEP)}
        onFit={fitToScreen}
        onReset={resetZoom}
      />

      {/* 조작 힌트 */}
      <div className="absolute bottom-4 right-3 select-none text-[10px] text-zinc-500">
        휠: 줌 · 빈곳 드래그: 이동 · Space+드래그: 이동
      </div>
    </div>
  );
}
