import type { FloorPlanRef, ShelfKind, ShelfLayout, TierBandOrientation } from "@/domain/types";

export type FloorPlanSnapshot = {
  version: 2;
  floorPlan: FloorPlanRef;
  shelves: ShelfLayout[];
  analysisMeta?: {
    model: string;
    analyzedAt: string;
    confidence?: number;
  };
};

export const FLOOR_PLAN_SNAPSHOT_STORAGE_KEY = "retail-floor-plan-snapshot-v2";

export function snapshotToJsonString(snap: FloorPlanSnapshot): string {
  return JSON.stringify(snap, null, 2);
}

const SHELF_KINDS: ShelfKind[] = ["gondola", "refrigerated", "endcap", "produce", "other"];
const TIER_ORIENTATIONS: TierBandOrientation[] = ["vertical", "horizontal"];

function parseShelfLayout(raw: unknown): ShelfLayout | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id ? o.id : null;
  if (!id) return null;
  const x = Number(o.x);
  const y = Number(o.y);
  const width = Number(o.width);
  const height = Number(o.height);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  const label = typeof o.label === "string" ? o.label : "";
  const shelf: ShelfLayout = { id, label, x, y, width, height };
  if (typeof o.bayCode === "string") shelf.bayCode = o.bayCode;
  if (typeof o.sectionCode === "string") shelf.sectionCode = o.sectionCode;
  if (typeof o.kind === "string" && SHELF_KINDS.includes(o.kind as ShelfKind)) {
    shelf.kind = o.kind as ShelfKind;
  }
  if (typeof o.tierBands === "string" && TIER_ORIENTATIONS.includes(o.tierBands as TierBandOrientation)) {
    shelf.tierBands = o.tierBands as TierBandOrientation;
  }
  if (o.grid && typeof o.grid === "object") {
    const g = o.grid as Record<string, unknown>;
    const cf = Number(g.colFrom);
    const ct = Number(g.colTo);
    const rf = Number(g.rowFrom);
    const rt = Number(g.rowTo);
    if (Number.isFinite(cf) && Number.isFinite(ct) && Number.isFinite(rf) && Number.isFinite(rt)) {
      shelf.grid = { colFrom: cf, colTo: ct, rowFrom: rf, rowTo: rt };
    }
  }
  return shelf;
}

export function parseFloorPlanSnapshot(raw: unknown): FloorPlanSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 2) return null;
  if (!o.floorPlan || typeof o.floorPlan !== "object") return null;
  const fp = o.floorPlan as Record<string, unknown>;
  if (typeof fp.imageUrl !== "string" || !fp.imageUrl) return null;
  const fWidth = Number(fp.width);
  const fHeight = Number(fp.height);
  if (!Number.isFinite(fWidth) || !Number.isFinite(fHeight)) return null;
  const floorPlan: FloorPlanRef = { imageUrl: fp.imageUrl, width: fWidth, height: fHeight };
  if (!Array.isArray(o.shelves)) return null;
  const shelves: ShelfLayout[] = [];
  for (const item of o.shelves) {
    const s = parseShelfLayout(item);
    if (!s) return null;
    shelves.push(s);
  }
  const snap: FloorPlanSnapshot = { version: 2, floorPlan, shelves };
  if (o.analysisMeta && typeof o.analysisMeta === "object") {
    const m = o.analysisMeta as Record<string, unknown>;
    if (typeof m.model === "string" && typeof m.analyzedAt === "string") {
      snap.analysisMeta = {
        model: m.model,
        analyzedAt: m.analyzedAt,
        ...(typeof m.confidence === "number" ? { confidence: m.confidence } : {}),
      };
    }
  }
  return snap;
}

export function loadFloorPlanSnapshotFromStorage(): FloorPlanSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(FLOOR_PLAN_SNAPSHOT_STORAGE_KEY);
    if (!raw) return null;
    return parseFloorPlanSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveFloorPlanSnapshotToStorage(snap: FloorPlanSnapshot): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(FLOOR_PLAN_SNAPSHOT_STORAGE_KEY, snapshotToJsonString(snap));
}
