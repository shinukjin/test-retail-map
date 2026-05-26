"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  defaultEditorGridStyle,
  editorCellKey,
  EMPTY_GRID_ANCHOR,
  type BorderSides,
  type EditorGridCell,
  type EditorGridStyle,
  type EditorGroupStyle,
} from "@/experiments/konva/grid-editor-types";
import { applyCellMerge } from "@/experiments/konva/grid-merge";
import {
  clamp,
  DEFAULT_BORDER_WIDTH,
  effectiveBorderSides,
  groupStyleForCell,
  PAD,
} from "@/experiments/konva/grid-editor-cell-draw";
import {
  parseEditorGridSnapshot,
  snapshotToJsonString,
  type EditorGridSnapshot,
} from "@/experiments/konva/grid-snapshot";
import { BORDER_PRESET_SIDES } from "./border-presets";
import { MAX_DIM } from "./constants";
import {
  captureGridHistorySnapshot,
  type GridHistorySnapshot,
} from "./grid-history-utils";
import {
  buildClipboardFromSelection,
  clearSelectionRegion,
  pasteClipboardAt,
  type GridSelectionClipboard,
} from "./grid-clipboard-utils";
import {
  allAnchorKeys,
  anchorKeysTouchingColSpan,
  anchorKeysTouchingRowSpan,
  growSelectionRect,
  rectangularCellKeys,
  selectionBoundsFromKeys,
  shrinkSelectionToInnerRect,
  solidAnchorRectangleForMerge,
} from "./grid-selection-utils";

export type GridPersistenceConfig = {
  storageKey: string;
  notifyChanged: () => void;
  downloadFilename: string;
  /** 이 키의 localStorage를 추가로 불러올 수 있게 함(예: Konva↔Fabric 교차) */
  alternateStorageImportKey?: string;
};

/** 칸 클릭 시: 일반 / Ctrl·⌘ 다중 / Shift 범위 */
export type GridSelectOptions = {
  additive?: boolean;
  rangeExtend?: boolean;
};

const MAX_HISTORY = 50;
const HISTORY_DEBOUNCE_MS = 700;

export function useGridEditorModel({
  storageKey,
  notifyChanged,
  downloadFilename,
  alternateStorageImportKey,
}: GridPersistenceConfig) {
  const [colsIn, setColsIn] = useState("12");
  const [rowsIn, setRowsIn] = useState("8");
  const [gridStyle, setGridStyle] = useState<EditorGridStyle>(() => defaultEditorGridStyle());

  const [cols, setCols] = useState(0);
  const [rows, setRows] = useState(0);
  const [cells, setCells] = useState<Map<string, EditorGridCell>>(new Map());
  const [groupStyles, setGroupStyles] = useState<Record<string, EditorGroupStyle>>({});
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [mergeColspanIn, setMergeColspanIn] = useState("1");
  const [mergeRowspanIn, setMergeRowspanIn] = useState("1");

  const [cellWStr, setCellWStr] = useState(() => String(defaultEditorGridStyle().cellWidth));
  const [cellHStr, setCellHStr] = useState(() => String(defaultEditorGridStyle().cellHeight));
  const cellWFocusRef = useRef(false);
  const cellHFocusRef = useRef(false);

  /** true면 전역 기본 칸 배경·좌표 번호만 숨김(셀/그룹 배경·이름·매대·그룹 라벨은 유지) */
  const [hideEditorCellInteriorText, setHideEditorCellInteriorText] = useState(false);
  /** 그리드 바깥 행·열 번호 표시 */
  const [showRowColHeaders, setShowRowColHeaders] = useState(true);

  /** Shift 범위: 직전 클릭 칸 (없으면 현재 선택의 마지막 칸) */
  const rangeAnchorRef = useRef<string | null>(null);
  const selectedKeysRef = useRef<string[]>([]);
  const cellsRef = useRef(cells);
  const groupStylesRef = useRef(groupStyles);
  const colsRef = useRef(cols);
  const rowsRef = useRef(rows);
  const clipboardRef = useRef<GridSelectionClipboard | null>(null);
  const [clipboardInfo, setClipboardInfo] = useState<{ width: number; height: number } | null>(
    null,
  );

  const gridStyleRef = useRef(gridStyle);
  const undoStackRef = useRef<GridHistorySnapshot[]>([]);
  const redoStackRef = useRef<GridHistorySnapshot[]>([]);
  const isHistoryRestoreRef = useRef(false);
  const historyEditSessionRef = useRef(false);
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [historyTick, setHistoryTick] = useState(0);

  useLayoutEffect(() => {
    gridStyleRef.current = gridStyle;
  }, [gridStyle]);

  useLayoutEffect(() => {
    selectedKeysRef.current = selectedKeys;
  }, [selectedKeys]);

  useLayoutEffect(() => {
    cellsRef.current = cells;
  }, [cells]);

  useLayoutEffect(() => {
    groupStylesRef.current = groupStyles;
  }, [groupStyles]);

  useLayoutEffect(() => {
    colsRef.current = cols;
  }, [cols]);

  useLayoutEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    if (!cellWFocusRef.current) setCellWStr(String(gridStyle.cellWidth));
  }, [gridStyle.cellWidth]);

  useEffect(() => {
    if (!cellHFocusRef.current) setCellHStr(String(gridStyle.cellHeight));
  }, [gridStyle.cellHeight]);

  const hasGrid = cols > 0 && rows > 0 && cells.size > 0;
  const cw = gridStyle.cellWidth;
  const ch = gridStyle.cellHeight;

  const captureSnapshot = useCallback((): GridHistorySnapshot => {
    return captureGridHistorySnapshot(
      colsRef.current,
      rowsRef.current,
      cellsRef.current,
      groupStylesRef.current,
      gridStyleRef.current,
    );
  }, []);

  const pushHistoryNow = useCallback(() => {
    if (isHistoryRestoreRef.current || colsRef.current <= 0) return;
    historyEditSessionRef.current = false;
    if (historyTimerRef.current) {
      clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
    }
    undoStackRef.current.push(captureSnapshot());
    if (undoStackRef.current.length > MAX_HISTORY) undoStackRef.current.shift();
    redoStackRef.current = [];
    setHistoryTick((t) => t + 1);
  }, [captureSnapshot]);

  const scheduleHistoryPush = useCallback(() => {
    if (isHistoryRestoreRef.current || colsRef.current <= 0) return;
    if (!historyEditSessionRef.current) {
      pushHistoryNow();
      historyEditSessionRef.current = true;
    }
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    historyTimerRef.current = setTimeout(() => {
      historyEditSessionRef.current = false;
      historyTimerRef.current = null;
    }, HISTORY_DEBOUNCE_MS);
  }, [pushHistoryNow]);

  const restoreSnapshot = useCallback((snap: GridHistorySnapshot) => {
    isHistoryRestoreRef.current = true;
    setCols(snap.cols);
    setRows(snap.rows);
    setColsIn(String(snap.cols));
    setRowsIn(String(snap.rows));
    setCells(new Map(snap.cells));
    setGroupStyles({ ...snap.groupStyles });
    setGridStyle({ ...snap.gridStyle });
    setCellWStr(String(snap.gridStyle.cellWidth));
    setCellHStr(String(snap.gridStyle.cellHeight));
    setMergeColspanIn("1");
    setMergeRowspanIn("1");
    setSelectedKeys([]);
    rangeAnchorRef.current = null;
    queueMicrotask(() => {
      isHistoryRestoreRef.current = false;
    });
  }, []);

  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    if (historyTimerRef.current) {
      clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
    }
    historyEditSessionRef.current = false;
    redoStackRef.current.push(captureSnapshot());
    const prev = undoStackRef.current.pop()!;
    restoreSnapshot(prev);
    setError(null);
    setHistoryTick((t) => t + 1);
  }, [captureSnapshot, restoreSnapshot]);

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    if (historyTimerRef.current) {
      clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
    }
    historyEditSessionRef.current = false;
    undoStackRef.current.push(captureSnapshot());
    const next = redoStackRef.current.pop()!;
    restoreSnapshot(next);
    setError(null);
    setHistoryTick((t) => t + 1);
  }, [captureSnapshot, restoreSnapshot]);

  const canUndo = historyTick >= 0 && undoStackRef.current.length > 0;
  const canRedo = historyTick >= 0 && redoStackRef.current.length > 0;

  const selectCell = useCallback(
    (key: string | null, snapshot?: Map<string, EditorGridCell>, opts?: GridSelectOptions) => {
      const syncMergeFromKey = (k: string) => {
        const cell = snapshot!.get(k);
        if (cell && !cell.mergedInto) {
          setMergeColspanIn(String(cell.colspan));
          setMergeRowspanIn(String(cell.rowspan));
        }
      };

      if (!key || !snapshot) {
        setSelectedKeys([]);
        rangeAnchorRef.current = null;
        return;
      }

      if (opts?.rangeExtend) {
        const anchor =
          rangeAnchorRef.current ??
          (selectedKeysRef.current.length > 0
            ? selectedKeysRef.current[selectedKeysRef.current.length - 1]!
            : null);
        if (anchor) {
          const keys = rectangularCellKeys(cols, rows, anchor, key);
          setSelectedKeys(keys);
          rangeAnchorRef.current = key;
          if (keys.length === 1) syncMergeFromKey(keys[0]!);
          return;
        }
      }

      if (opts?.additive) {
        const prev = selectedKeysRef.current;
        const s = new Set(prev);
        if (s.has(key)) s.delete(key);
        else s.add(key);
        const next = Array.from(s);
        setSelectedKeys(next);
        rangeAnchorRef.current = key;
        if (next.length === 1) syncMergeFromKey(next[0]!);
        return;
      }

      setSelectedKeys([key]);
      rangeAnchorRef.current = key;
      syncMergeFromKey(key);
    },
    [cols, rows],
  );

  const buildGrid = useCallback(() => {
    setError(null);
    pushHistoryNow();
    const c = clamp(Math.floor(Number(colsIn)) || 0, 1, MAX_DIM);
    const r = clamp(Math.floor(Number(rowsIn)) || 0, 1, MAX_DIM);
    const next = new Map<string, EditorGridCell>();
    for (let row = 0; row < r; row++) {
      for (let col = 0; col < c; col++) {
        const key = editorCellKey(row, col);
        next.set(key, {
          row,
          col,
          shelfCode: "",
          tier: null,
          cellName: "",
          groupCode: "",
          colspan: 1,
          rowspan: 1,
          mergedInto: null,
        });
      }
    }
    setCols(c);
    setRows(r);
    setCells(next);
    setGroupStyles({});
    selectCell(null);
    setMergeColspanIn("1");
    setMergeRowspanIn("1");
  }, [colsIn, pushHistoryNow, rowsIn, selectCell]);

  const selectedKey = selectedKeys.length === 1 ? selectedKeys[0] : null;
  const selected = selectedKey ? cells.get(selectedKey) : undefined;

  const updateSelected = useCallback(
    (patch: Partial<EditorGridCell>) => {
      if (selectedKeys.length === 0) return;
      scheduleHistoryPush();
      setCells((prev) => {
        const n = new Map(prev);
        for (const sk of selectedKeys) {
          const cur = n.get(sk);
          if (!cur || cur.mergedInto) continue;
          n.set(sk, { ...cur, ...patch });
        }
        return n;
      });
    },
    [selectedKeys, scheduleHistoryPush],
  );

  const clearCellOverrides = useCallback(() => {
    if (selectedKeys.length === 0) return;
    pushHistoryNow();
    setCells((prev) => {
      const n = new Map(prev);
      for (const sk of selectedKeys) {
        const cur = n.get(sk);
        if (!cur) continue;
        n.set(sk, {
          ...cur,
          fontSize: undefined,
          cellFill: undefined,
          textColor: undefined,
          showBorder: undefined,
          borderColor: undefined,
          borderWidth: undefined,
          borderStyle: undefined,
          borderSides: undefined,
          cellDecoration: undefined,
          alignH: undefined,
          alignV: undefined,
        });
      }
      return n;
    });
  }, [pushHistoryNow, selectedKeys]);

  const clearSelectionContent = useCallback(() => {
    if (selectedKeys.length === 0) return;
    pushHistoryNow();
    setCells((prev) => {
      const n = new Map(prev);
      for (const sk of selectedKeys) {
        const cur = n.get(sk);
        if (!cur || cur.mergedInto) continue;
        n.set(sk, {
          ...cur,
          shelfCode: "",
          tier: null,
          cellName: "",
          groupCode: "",
        });
      }
      return n;
    });
  }, [pushHistoryNow, selectedKeys]);

  const applyGroupToSelection = useCallback((raw: string) => {
    const groupCode = raw.slice(0, 40);
    if (selectedKeys.length === 0) return;
    pushHistoryNow();
    setCells((prev) => {
      const n = new Map(prev);
      for (const k of selectedKeys) {
        const c = n.get(k);
        if (c) n.set(k, { ...c, groupCode });
      }
      return n;
    });
  }, [pushHistoryNow, selectedKeys]);

  const applyMergeFromInputs = useCallback(() => {
    if (selectedKeys.length !== 1 || !hasGrid) return;
    const anchorKey = selectedKeys[0];
    const cs = Math.floor(Number(mergeColspanIn)) || 1;
    const rs = Math.floor(Number(mergeRowspanIn)) || 1;
    pushHistoryNow();
    setCells((prev) => {
      const anchor = prev.get(anchorKey);
      if (!anchor || anchor.mergedInto) return prev;
      const res = applyCellMerge(prev, cols, rows, anchorKey, cs, rs);
      if (!res.ok) {
        setError(res.message);
        return prev;
      }
      setError(null);
      const merged = res.cells.get(anchorKey);
      queueMicrotask(() => {
        if (merged && !merged.mergedInto) {
          setMergeColspanIn(String(merged.colspan));
          setMergeRowspanIn(String(merged.rowspan));
        }
      });
      return res.cells;
    });
  }, [cols, hasGrid, mergeColspanIn, mergeRowspanIn, pushHistoryNow, rows, selectedKeys]);

  /** 다중 선택이 빈틈 없는 1×1 직사각형이면 한 칸으로 병합 */
  const applyMergeFromRectSelection = useCallback(() => {
    if (!hasGrid || selectedKeys.length < 2) return;
    pushHistoryNow();
    setCells((prev) => {
      const spec = solidAnchorRectangleForMerge(selectedKeys, prev);
      if (!spec) {
        setError("병합: 1×1 칸만 빈틈 없는 직사각형으로 두 칸 이상 선택하세요.");
        return prev;
      }
      const res = applyCellMerge(prev, cols, rows, spec.anchorKey, spec.colspan, spec.rowspan);
      if (!res.ok) {
        setError(res.message);
        return prev;
      }
      setError(null);
      queueMicrotask(() => {
        setSelectedKeys([spec.anchorKey]);
        setMergeColspanIn(String(spec.colspan));
        setMergeRowspanIn(String(spec.rowspan));
      });
      return res.cells;
    });
  }, [cols, hasGrid, pushHistoryNow, rows, selectedKeys]);

  const unmergeSelected = useCallback(() => {
    if (selectedKeys.length !== 1 || !hasGrid) return;
    const anchorKey = selectedKeys[0]!;
    const anchor = cellsRef.current.get(anchorKey);
    if (!anchor || anchor.mergedInto) return;
    if (anchor.colspan === 1 && anchor.rowspan === 1) return;
    pushHistoryNow();
    setCells((prev) => {
      const res = applyCellMerge(prev, cols, rows, anchorKey, 1, 1);
      return res.ok ? res.cells : prev;
    });
    setMergeColspanIn("1");
    setMergeRowspanIn("1");
  }, [cols, hasGrid, pushHistoryNow, rows, selectedKeys]);

  const applySnapshotToEditor = useCallback(
    (snap: EditorGridSnapshot, recordHistory = true) => {
      if (recordHistory && colsRef.current > 0) pushHistoryNow();
      setError(null);
      setCols(snap.cols);
      setRows(snap.rows);
      setColsIn(String(snap.cols));
      setRowsIn(String(snap.rows));
      const m = new Map<string, EditorGridCell>();
      for (const c of snap.cells) {
        m.set(editorCellKey(c.row, c.col), c);
      }
      setCells(m);
      setGroupStyles(snap.groupStyles ? { ...snap.groupStyles } : {});
      setGridStyle({ ...snap.gridStyle });
      setCellWStr(String(snap.gridStyle.cellWidth));
      setCellHStr(String(snap.gridStyle.cellHeight));
      setMergeColspanIn("1");
      setMergeRowspanIn("1");
      selectCell(null);
    },
    [pushHistoryNow, selectCell],
  );

  const loadFromLocalStorage = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        setError("이 편집기에 저장된 그리드가 없습니다.");
        return;
      }
      const parsed = parseEditorGridSnapshot(JSON.parse(raw));
      if (!parsed) {
        setError("저장본 형식을 읽을 수 없습니다.");
        return;
      }
      applySnapshotToEditor(parsed);
      notifyChanged();
    } catch {
      setError("저장본을 불러오지 못했습니다.");
    }
  }, [applySnapshotToEditor, notifyChanged, storageKey]);

  const loadFromAlternateLocalStorage = useCallback(() => {
    if (typeof window === "undefined" || !alternateStorageImportKey) return;
    try {
      const raw = localStorage.getItem(alternateStorageImportKey);
      if (!raw) {
        setError("다른 편집기 저장본이 없습니다.");
        return;
      }
      const parsed = parseEditorGridSnapshot(JSON.parse(raw));
      if (!parsed) {
        setError("저장본 형식을 읽을 수 없습니다.");
        return;
      }
      applySnapshotToEditor(parsed);
      notifyChanged();
    } catch {
      setError("저장본을 불러오지 못했습니다.");
    }
  }, [alternateStorageImportKey, applySnapshotToEditor, notifyChanged]);

  const importGridFromJsonString = useCallback(
    (json: string) => {
      try {
        const parsed = parseEditorGridSnapshot(JSON.parse(json));
        if (!parsed) {
          setError("JSON이 편집기 스냅샷 형식이 아닙니다.");
          return;
        }
        applySnapshotToEditor(parsed);
        notifyChanged();
      } catch {
        setError("JSON을 파싱할 수 없습니다.");
      }
    },
    [applySnapshotToEditor, notifyChanged],
  );

  const stageW = useMemo(
    () => (hasGrid ? PAD * 2 + cols * cw : 400),
    [cols, cw, hasGrid],
  );
  const stageH = useMemo(
    () => (hasGrid ? PAD * 2 + rows * ch : 300),
    [ch, hasGrid, rows],
  );

  const saveGridJson = useCallback(() => {
    if (!hasGrid) return;
    const savedGridStyle: EditorGridStyle = {
      ...gridStyle,
      showBorder: false,
      borderWidth: 0,
      borderSides: undefined,
    };
    const snapshot: EditorGridSnapshot = {
      cols,
      rows,
      gridStyle: savedGridStyle,
      cells: Array.from(cells.values()),
      ...(Object.keys(groupStyles).length > 0 ? { groupStyles } : {}),
    };
    const json = snapshotToJsonString(snapshot);
    try {
      localStorage.setItem(storageKey, json);
    } catch {
      /* private mode / quota */
    }
    notifyChanged();
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = downloadFilename;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [cells, cols, gridStyle, groupStyles, rows, hasGrid, storageKey, notifyChanged, downloadFilename]);

  const selectEntireRowsInSelectionBounds = useCallback(() => {
    if (!hasGrid) return;
    const b = selectionBoundsFromKeys(selectedKeysRef.current, cellsRef.current);
    if (!b) return;
    setSelectedKeys(anchorKeysTouchingRowSpan(b.r0, b.r1, cellsRef.current));
  }, [hasGrid]);

  const selectEntireColumnsInSelectionBounds = useCallback(() => {
    if (!hasGrid) return;
    const b = selectionBoundsFromKeys(selectedKeysRef.current, cellsRef.current);
    if (!b) return;
    setSelectedKeys(anchorKeysTouchingColSpan(b.c0, b.c1, cellsRef.current));
  }, [hasGrid]);

  const selectAllAnchors = useCallback(() => {
    if (!hasGrid) return;
    setSelectedKeys(allAnchorKeys(cellsRef.current));
  }, [hasGrid]);

  const growSelection = useCallback(
    (dir: "up" | "down" | "left" | "right") => {
      if (!hasGrid) return;
      const keys = selectedKeysRef.current;
      if (keys.length === 0) return;
      setSelectedKeys(growSelectionRect(cols, rows, keys, cellsRef.current, dir));
    },
    [cols, hasGrid, rows],
  );

  const shrinkSelectionInner = useCallback(() => {
    if (!hasGrid) return;
    const keys = selectedKeysRef.current;
    if (keys.length === 0) return;
    setSelectedKeys(shrinkSelectionToInnerRect(cols, rows, keys, cellsRef.current));
  }, [cols, hasGrid, rows]);

  const copySelection = useCallback(() => {
    if (!hasGrid || selectedKeysRef.current.length === 0) return;
    const clip = buildClipboardFromSelection(
      selectedKeysRef.current,
      cellsRef.current,
      groupStylesRef.current,
    );
    if (!clip) return;
    clipboardRef.current = clip;
    setClipboardInfo({ width: clip.width, height: clip.height });
    setError(null);
  }, [hasGrid]);

  const cutSelection = useCallback(() => {
    if (!hasGrid || selectedKeysRef.current.length === 0) return;
    const keys = selectedKeysRef.current;
    const clip = buildClipboardFromSelection(keys, cellsRef.current, groupStylesRef.current);
    if (!clip) return;
    clipboardRef.current = clip;
    setClipboardInfo({ width: clip.width, height: clip.height });
    pushHistoryNow();
    const cleared = clearSelectionRegion(keys, cellsRef.current);
    if (!cleared) return;
    setCells(cleared);
    setError(null);
  }, [hasGrid, pushHistoryNow]);

  const pasteSelection = useCallback(() => {
    const clip = clipboardRef.current;
    if (!clip || !hasGrid) {
      if (hasGrid) setError("복사된 칸이 없습니다. 먼저 선택 후 ⌘/Ctrl+C로 복사하세요.");
      return;
    }
    const keys = selectedKeysRef.current;
    const bounds =
      keys.length > 0 ? selectionBoundsFromKeys(keys, cellsRef.current) : null;
    if (!bounds) {
      setError("붙여넣을 위치를 선택하세요.");
      return;
    }
    const res = pasteClipboardAt(
      clip,
      bounds.r0,
      bounds.c0,
      cellsRef.current,
      colsRef.current,
      rowsRef.current,
    );
    if (!res.ok) {
      setError(res.message);
      return;
    }
    pushHistoryNow();
    setError(null);
    setCells(res.cells);
    if (Object.keys(clip.groupStyles).length > 0) {
      setGroupStyles((prev) => ({ ...prev, ...clip.groupStyles }));
    }
    setSelectedKeys(res.pastedKeys);
    rangeAnchorRef.current = res.pastedKeys[res.pastedKeys.length - 1] ?? null;
  }, [hasGrid, pushHistoryNow]);

  const duplicateSelection = useCallback(() => {
    if (!hasGrid || selectedKeysRef.current.length === 0) return;
    const keys = selectedKeysRef.current;
    const bounds = selectionBoundsFromKeys(keys, cellsRef.current);
    if (!bounds) return;
    const clip = buildClipboardFromSelection(keys, cellsRef.current, groupStylesRef.current);
    if (!clip) return;
    const targetR0 = bounds.r0 + clip.height;
    const targetC0 = bounds.c0;
    if (targetR0 + clip.height > rowsRef.current && targetC0 + clip.width > colsRef.current) {
      setError("복제할 공간이 부족합니다.");
      return;
    }
    let pasteR0 = targetR0;
    let pasteC0 = targetC0;
    if (pasteR0 + clip.height > rowsRef.current) pasteR0 = bounds.r0;
    if (pasteC0 + clip.width > colsRef.current) pasteC0 = Math.max(0, bounds.c0 - clip.width);
    const res = pasteClipboardAt(
      clip,
      pasteR0,
      pasteC0,
      cellsRef.current,
      colsRef.current,
      rowsRef.current,
    );
    if (!res.ok) {
      setError(res.message);
      return;
    }
    pushHistoryNow();
    setError(null);
    setCells(res.cells);
    if (Object.keys(clip.groupStyles).length > 0) {
      setGroupStyles((prev) => ({ ...prev, ...clip.groupStyles }));
    }
    setSelectedKeys(res.pastedKeys);
    rangeAnchorRef.current = res.pastedKeys[res.pastedKeys.length - 1] ?? null;
  }, [hasGrid, pushHistoryNow]);

  const patchSelectedBorderSide = useCallback(
    (edge: keyof BorderSides, on: boolean) => {
      if (selectedKeys.length === 0) return;
      pushHistoryNow();
      setCells((prev) => {
        const n = new Map(prev);
        for (const sk of selectedKeys) {
          const cur = n.get(sk);
          if (!cur || cur.mergedInto) continue;
          const grp = groupStyleForCell(cur, groupStyles);
          const s = effectiveBorderSides(cur, gridStyle, grp);
          const borderSides: BorderSides = { ...s, [edge]: on };
          const anySide = borderSides.top || borderSides.right || borderSides.bottom || borderSides.left;
          if (!anySide) {
            n.set(sk, { ...cur, showBorder: false, borderWidth: 0, borderSides: undefined });
          } else {
            n.set(sk, {
              ...cur,
              borderSides,
              showBorder: true,
              borderWidth: Math.max(DEFAULT_BORDER_WIDTH, cur.borderWidth ?? gridStyle.borderWidth),
            });
          }
        }
        return n;
      });
    },
    [pushHistoryNow, selectedKeys, gridStyle, groupStyles],
  );

  const applySelectedBorderSidesPreset = useCallback(
    (preset: keyof typeof BORDER_PRESET_SIDES) => {
      if (selectedKeys.length === 0) return;
      pushHistoryNow();
      const borderSides = BORDER_PRESET_SIDES[preset];
      const anySide = preset !== "none";
      setCells((prev) => {
        const n = new Map(prev);
        for (const sk of selectedKeys) {
          const cur = n.get(sk);
          if (!cur || cur.mergedInto) continue;
          if (!anySide) {
            n.set(sk, { ...cur, showBorder: false, borderWidth: 0, borderSides: undefined });
          } else {
            n.set(sk, {
              ...cur,
              borderSides: { ...borderSides },
              showBorder: true,
              borderWidth: Math.max(DEFAULT_BORDER_WIDTH, cur.borderWidth ?? gridStyle.borderWidth),
            });
          }
        }
        return n;
      });
    },
    [pushHistoryNow, selectedKeys, gridStyle],
  );

  const patchGroupBorderSide = useCallback(
    (groupCode: string, edge: keyof BorderSides, on: boolean) => {
      const gc = groupCode.trim().slice(0, 40);
      if (!gc) return;
      pushHistoryNow();
      setGroupStyles((prev) => {
        const cur = prev[gc] ?? {};
        const s = effectiveBorderSides(EMPTY_GRID_ANCHOR, gridStyle, cur);
        const borderSides: BorderSides = { ...s, [edge]: on };
        const anySide = borderSides.top || borderSides.right || borderSides.bottom || borderSides.left;
        const next: EditorGroupStyle = { ...cur };
        if (!anySide) {
          next.showBorder = false;
          next.borderWidth = 0;
          next.borderSides = undefined;
        } else {
          next.borderSides = borderSides;
          next.showBorder = true;
          next.borderWidth = Math.max(DEFAULT_BORDER_WIDTH, next.borderWidth ?? gridStyle.borderWidth);
        }
        return { ...prev, [gc]: next };
      });
    },
    [gridStyle, pushHistoryNow],
  );

  const applyGroupBorderSidesPreset = useCallback(
    (groupCode: string, preset: keyof typeof BORDER_PRESET_SIDES) => {
      const gc = groupCode.trim().slice(0, 40);
      if (!gc) return;
      pushHistoryNow();
      const borderSides = BORDER_PRESET_SIDES[preset];
      const anySide = preset !== "none";
      setGroupStyles((prev) => {
        const cur = prev[gc] ?? {};
        const next: EditorGroupStyle = { ...cur };
        if (!anySide) {
          next.showBorder = false;
          next.borderWidth = 0;
          next.borderSides = undefined;
        } else {
          next.borderSides = { ...borderSides };
          next.showBorder = true;
          next.borderWidth = Math.max(DEFAULT_BORDER_WIDTH, next.borderWidth ?? gridStyle.borderWidth);
        }
        return { ...prev, [gc]: next };
      });
    },
    [gridStyle, pushHistoryNow],
  );

  const setGridStyleWithHistory = useCallback(
    (updater: EditorGridStyle | ((prev: EditorGridStyle) => EditorGridStyle)) => {
      scheduleHistoryPush();
      setGridStyle(updater);
    },
    [scheduleHistoryPush],
  );

  return {
    colsIn,
    setColsIn,
    rowsIn,
    setRowsIn,
    gridStyle,
    setGridStyle: setGridStyleWithHistory,
    cols,
    rows,
    cells,
    groupStyles,
    selectedKeys,
    selectedKey,
    selectCell,
    error,
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
    selected,
    updateSelected,
    clearCellOverrides,
    clearSelectionContent,
    applyGroupToSelection,
    applyMergeFromInputs,
    applyMergeFromRectSelection,
    unmergeSelected,
    stageW,
    stageH,
    saveGridJson,
    selectEntireRowsInSelectionBounds,
    selectEntireColumnsInSelectionBounds,
    selectAllAnchors,
    growSelection,
    shrinkSelectionInner,
    patchSelectedBorderSide,
    applySelectedBorderSidesPreset,
    patchGroupBorderSide,
    applyGroupBorderSidesPreset,
    alternateStorageImportKey,
    hideEditorCellInteriorText,
    setHideEditorCellInteriorText,
    copySelection,
    cutSelection,
    pasteSelection,
    duplicateSelection,
    clipboardInfo,
    undo,
    redo,
    canUndo,
    canRedo,
    showRowColHeaders,
    setShowRowColHeaders,
  };
}

export type GridEditorModel = ReturnType<typeof useGridEditorModel>;
