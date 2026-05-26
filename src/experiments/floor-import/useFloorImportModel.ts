"use client";

import { useCallback, useRef, useState } from "react";
import type { FloorPlanRef, ShelfLayout } from "@/domain/types";
import type { FloorPlanSnapshot } from "@/domain/floor-plan-snapshot";
import {
  loadFloorPlanSnapshotFromStorage,
  parseFloorPlanSnapshot,
  saveFloorPlanSnapshotToStorage,
  snapshotToJsonString,
} from "@/domain/floor-plan-snapshot";
import { getFileKind, readFloorPlanFile, readPdfFile } from "@/lib/upload-floor-plan";
import { subdivideShelfLayout } from "@/lib/shelf-subdivide";
import type { SubdivideEntry } from "@/lib/zone-subdivide-utils";

export type FloorImportStatus = "idle" | "uploading" | "converting" | "analyzing" | "done" | "error";

type HistoryEntry = {
  shelves: ShelfLayout[];
};

const MAX_HISTORY = 50;

export type AiProvider = "openai" | "google" | "gemini";

export type FloorImportModel = {
  floorPlan: FloorPlanRef | null;
  shelves: ShelfLayout[];
  selectedId: string | null;
  status: FloorImportStatus;
  errorMessage: string | null;
  analysisMeta: FloorPlanSnapshot["analysisMeta"] | undefined;
  canUndo: boolean;
  canRedo: boolean;
  pdfTotalPages: number | null;
  pdfCurrentPage: number;
  aiProvider: AiProvider;
  setAiProvider: (p: AiProvider) => void;
  rawResponse: string | null;       // AI 원본 응답 (디버그용)
  generatedSvg: string | null;      // AI가 생성한 SVG 이미지

  uploadImage: (file: File) => Promise<void>;
  loadPdfPage: (page: number) => Promise<void>;
  analyzeWithAI: () => Promise<void>;
  generateSvgWithAI: () => Promise<void>;
  selectShelf: (id: string | null) => void;
  updateShelf: (id: string, patch: Partial<ShelfLayout>) => void;
  addShelf: (shelf: ShelfLayout) => void;
  deleteShelf: (id: string) => void;
  setShelves: (shelves: ShelfLayout[]) => void;
  undo: () => void;
  redo: () => void;
  saveJson: () => void;
  importFromJson: (json: string) => boolean;
  loadFromStorage: () => void;
  subdivideShelf: (id: string, subdivCols: number, subdivRows: number, entries: SubdivideEntry[]) => void;
};

export function useFloorImportModel(): FloorImportModel {
  const [floorPlan, setFloorPlan] = useState<FloorPlanRef | null>(null);
  const [shelves, _setShelves] = useState<ShelfLayout[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<FloorImportStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [analysisMeta, setAnalysisMeta] = useState<FloorPlanSnapshot["analysisMeta"]>(undefined);
  const [pdfTotalPages, setPdfTotalPages] = useState<number | null>(null);
  const [pdfCurrentPage, setPdfCurrentPage] = useState(1);
  const [aiProvider, setAiProvider] = useState<AiProvider>("openai");
  const [rawResponse, setRawResponse] = useState<string | null>(null);
  const [generatedSvg, setGeneratedSvg] = useState<string | null>(null);

  const historyRef = useRef<HistoryEntry[]>([]);
  const futureRef = useRef<HistoryEntry[]>([]);
  const floorPlanRef = useRef<FloorPlanRef | null>(null);
  const pdfFileRef = useRef<File | null>(null);
  const [historyAvailability, setHistoryAvailability] = useState({
    canUndo: false,
    canRedo: false,
  });

  const syncHistoryAvailability = useCallback(() => {
    setHistoryAvailability({
      canUndo: historyRef.current.length > 0,
      canRedo: futureRef.current.length > 0,
    });
  }, []);

  const pushHistory = useCallback((current: ShelfLayout[]) => {
    historyRef.current.push({ shelves: current.map((s) => ({ ...s })) });
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
    futureRef.current = [];
    syncHistoryAvailability();
  }, [syncHistoryAvailability]);

  const autoSave = useCallback(
    (fp: FloorPlanRef, sh: ShelfLayout[], meta?: FloorPlanSnapshot["analysisMeta"]) => {
      const snap: FloorPlanSnapshot = { version: 2, floorPlan: fp, shelves: sh, ...(meta ? { analysisMeta: meta } : {}) };
      saveFloorPlanSnapshotToStorage(snap);
    },
    [],
  );

  const setShelves = useCallback(
    (next: ShelfLayout[], recordHistory = true, current?: ShelfLayout[]) => {
      _setShelves((prev) => {
        if (recordHistory) pushHistory(current ?? prev);
        return next;
      });
    },
    [pushHistory],
  );

  const applyFloorPlan = useCallback((fp: FloorPlanRef) => {
    setFloorPlan(fp);
    floorPlanRef.current = fp;
    _setShelves([]);
    historyRef.current = [];
    futureRef.current = [];
    syncHistoryAvailability();
    setSelectedId(null);
    setAnalysisMeta(undefined);
    setStatus("idle");
  }, [syncHistoryAvailability]);

  const uploadImage = useCallback(async (file: File) => {
    setStatus("uploading");
    setErrorMessage(null);
    setPdfTotalPages(null);
    setPdfCurrentPage(1);
    pdfFileRef.current = null;

    const kind = getFileKind(file);
    if (kind === "unsupported") {
      setErrorMessage("지원하지 않는 파일 형식입니다. PNG, JPG, PDF, DWG, DXF 파일을 사용하세요.");
      setStatus("error");
      return;
    }

    try {
      if (kind === "pdf") {
        pdfFileRef.current = file;
        const result = await readPdfFile(file, 1);
        setPdfTotalPages(result.totalPages);
        setPdfCurrentPage(1);
        applyFloorPlan({ imageUrl: result.imageUrl, width: result.width, height: result.height });
      } else if (kind === "dwg") {
        setStatus("converting");
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/floor-plan/convert", { method: "POST", body: formData });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: "변환 오류" }));
          throw new Error((body as { error?: string }).error ?? "DWG 변환 오류");
        }
        const data = (await res.json()) as { imageBase64: string; mimeType: string; width: number; height: number };
        const imageUrl = `data:${data.mimeType};base64,${data.imageBase64}`;
        applyFloorPlan({ imageUrl, width: data.width, height: data.height });
      } else {
        const uploaded = await readFloorPlanFile(file);
        applyFloorPlan({ imageUrl: uploaded.imageUrl, width: uploaded.width, height: uploaded.height });
      }
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "업로드 오류");
      setStatus("error");
    }
  }, [applyFloorPlan]);

  const loadPdfPage = useCallback(async (page: number) => {
    const file = pdfFileRef.current;
    if (!file || !pdfTotalPages) return;
    const safe = Math.max(1, Math.min(page, pdfTotalPages));
    setStatus("uploading");
    setErrorMessage(null);
    try {
      const result = await readPdfFile(file, safe);
      setPdfCurrentPage(safe);
      const fp: FloorPlanRef = { imageUrl: result.imageUrl, width: result.width, height: result.height };
      setFloorPlan(fp);
      floorPlanRef.current = fp;
      setStatus("idle");
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "PDF 페이지 로드 오류");
      setStatus("error");
    }
  }, [pdfTotalPages]);

  const analyzeWithAI = useCallback(async () => {
    const fp = floorPlanRef.current ?? floorPlan;
    if (!fp) return;
    setStatus("analyzing");
    setErrorMessage(null);
    setRawResponse(null);
    try {
      const { dataUrlToBase64, dataUrlMimeType } = await import("@/lib/upload-floor-plan");
      const base64 = dataUrlToBase64(fp.imageUrl);
      const mimeType = dataUrlMimeType(fp.imageUrl);
      const res = await fetch("/api/floor-plan/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
          width: fp.width,
          height: fp.height,
          provider: aiProvider,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "API 오류" }));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { regions?: unknown; model?: string };
      setRawResponse(JSON.stringify(data, null, 2));
      const { normalizeVisionResult } = await import("@/lib/normalize-vision-result");
      const regions = Array.isArray(data.regions) ? data.regions : [];
      const newShelves = normalizeVisionResult(regions as import("@/lib/normalize-vision-result").VisionRegion[], fp.width, fp.height);
      const modelName = data.model ?? aiProvider;
      setShelves(newShelves, false);
      setAnalysisMeta({ model: modelName, analyzedAt: new Date().toISOString() });
      setStatus("done");
      autoSave(fp, newShelves, { model: modelName, analyzedAt: new Date().toISOString() });
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "분석 오류");
      setStatus("error");
    }
  }, [autoSave, floorPlan, setShelves, aiProvider]);

  const generateSvgWithAI = useCallback(async () => {
    const fp = floorPlanRef.current ?? floorPlan;
    if (!fp) return;
    setStatus("analyzing");
    setErrorMessage(null);
    setRawResponse(null);
    try {
      const { dataUrlToBase64, dataUrlMimeType } = await import("@/lib/upload-floor-plan");
      const base64 = dataUrlToBase64(fp.imageUrl);
      const mimeType = dataUrlMimeType(fp.imageUrl);
      const res = await fetch("/api/floor-plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType, width: fp.width, height: fp.height }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "API 오류" }));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { svg?: string };
      if (!data.svg) throw new Error("SVG 응답이 없습니다.");
      setRawResponse(data.svg.slice(0, 500) + (data.svg.length > 500 ? "\n...(생략)" : ""));
      setGeneratedSvg(data.svg);
      setStatus("done");
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "SVG 생성 오류");
      setStatus("error");
    }
  }, [floorPlan]);

  const selectShelf = useCallback((id: string | null) => setSelectedId(id), []);

  const updateShelf = useCallback(
    (id: string, patch: Partial<ShelfLayout>) => {
      _setShelves((prev) => {
        pushHistory(prev);
        const next = prev.map((s) => (s.id === id ? { ...s, ...patch } : s));
        const fp = floorPlanRef.current;
        if (fp) autoSave(fp, next, analysisMeta);
        return next;
      });
    },
    [autoSave, pushHistory, analysisMeta],
  );

  const addShelf = useCallback(
    (shelf: ShelfLayout) => {
      _setShelves((prev) => {
        pushHistory(prev);
        const next = [...prev, shelf];
        const fp = floorPlanRef.current;
        if (fp) autoSave(fp, next, analysisMeta);
        return next;
      });
    },
    [autoSave, pushHistory, analysisMeta],
  );

  const deleteShelf = useCallback(
    (id: string) => {
      _setShelves((prev) => {
        pushHistory(prev);
        const next = prev.filter((s) => s.id !== id);
        if (id === selectedId) setSelectedId(null);
        const fp = floorPlanRef.current;
        if (fp) autoSave(fp, next, analysisMeta);
        return next;
      });
    },
    [autoSave, pushHistory, analysisMeta, selectedId],
  );

  const undo = useCallback(() => {
    _setShelves((prev) => {
      const entry = historyRef.current.pop();
      if (!entry) return prev;
      futureRef.current.push({ shelves: prev.map((s) => ({ ...s })) });
      syncHistoryAvailability();
      return entry.shelves;
    });
  }, [syncHistoryAvailability]);

  const redo = useCallback(() => {
    _setShelves((prev) => {
      const entry = futureRef.current.pop();
      if (!entry) return prev;
      historyRef.current.push({ shelves: prev.map((s) => ({ ...s })) });
      syncHistoryAvailability();
      return entry.shelves;
    });
  }, [syncHistoryAvailability]);

  const saveJson = useCallback(() => {
    const fp = floorPlanRef.current ?? floorPlan;
    if (!fp) return;
    const snap: FloorPlanSnapshot = {
      version: 2,
      floorPlan: fp,
      shelves,
      ...(analysisMeta ? { analysisMeta } : {}),
    };
    const blob = new Blob([snapshotToJsonString(snap)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "floor-plan-snapshot.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [floorPlan, shelves, analysisMeta]);

  const importFromJson = useCallback(
    (json: string): boolean => {
      try {
        const parsed = parseFloorPlanSnapshot(JSON.parse(json));
        if (!parsed) return false;
        setFloorPlan(parsed.floorPlan);
        floorPlanRef.current = parsed.floorPlan;
        _setShelves(parsed.shelves);
        historyRef.current = [];
        futureRef.current = [];
        syncHistoryAvailability();
        setSelectedId(null);
        setAnalysisMeta(parsed.analysisMeta);
        setStatus("done");
        saveFloorPlanSnapshotToStorage(parsed);
        return true;
      } catch {
        return false;
      }
    },
    [syncHistoryAvailability],
  );

  const loadFromStorage = useCallback(() => {
    const snap = loadFloorPlanSnapshotFromStorage();
    if (!snap) return;
    setFloorPlan(snap.floorPlan);
    floorPlanRef.current = snap.floorPlan;
    _setShelves(snap.shelves);
    historyRef.current = [];
    futureRef.current = [];
    syncHistoryAvailability();
    setSelectedId(null);
    setAnalysisMeta(snap.analysisMeta);
    setStatus("done");
  }, [syncHistoryAvailability]);

  const subdivideShelf = useCallback(
    (id: string, subdivCols: number, subdivRows: number, entries: SubdivideEntry[]) => {
      _setShelves((prev) => {
        const target = prev.find((s) => s.id === id);
        if (!target) return prev;
        pushHistory(prev);
        const children = subdivideShelfLayout(target, subdivCols, subdivRows, entries);
        const next = prev.filter((s) => s.id !== id).concat(children);
        const fp = floorPlanRef.current;
        if (fp) autoSave(fp, next, analysisMeta);
        if (children[0]) setSelectedId(children[0].id);
        return next;
      });
    },
    [autoSave, pushHistory, analysisMeta],
  );

  return {
    floorPlan,
    shelves,
    selectedId,
    status,
    errorMessage,
    analysisMeta,
    canUndo: historyAvailability.canUndo,
    canRedo: historyAvailability.canRedo,
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
    addShelf,
    deleteShelf,
    setShelves: (sh) => setShelves(sh),
    undo,
    redo,
    saveJson,
    importFromJson,
    loadFromStorage,
    subdivideShelf,
  };
}
