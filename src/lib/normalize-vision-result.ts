import type { ShelfKind, ShelfLayout } from "@/domain/types";

export type VisionRegion = {
  label: string;
  kind?: string;
  confidence?: number;
  bbox: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  detectedText?: string;
  tierCount?: number;
  orientation?: string;
  category?: string;
};

export type VisionApiResponse = {
  regions: VisionRegion[];
};

const SHELF_KINDS: ShelfKind[] = ["gondola", "refrigerated", "endcap", "produce", "other"];
const MIN_DIMENSION_PX = 10;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function autoAssignBayCode(idx: number): string {
  const letter = String.fromCharCode(65 + Math.floor(idx / 9));
  const num = (idx % 9) + 1;
  return `${letter}${num}`;
}

export function normalizeVisionResult(
  regions: VisionRegion[],
  imageWidth: number,
  imageHeight: number,
): ShelfLayout[] {
  const out: ShelfLayout[] = [];
  let idx = 0;
  for (const r of regions) {
    const nx = clamp(r.bbox.x, 0, 1);
    const ny = clamp(r.bbox.y, 0, 1);
    const nw = clamp(r.bbox.w, 0, 1 - nx);
    const nh = clamp(r.bbox.h, 0, 1 - ny);
    const px = Math.round(nx * imageWidth);
    const py = Math.round(ny * imageHeight);
    const pw = Math.round(nw * imageWidth);
    const ph = Math.round(nh * imageHeight);
    if (pw < MIN_DIMENSION_PX || ph < MIN_DIMENSION_PX) continue;
    const kind: ShelfKind | undefined =
      r.kind && SHELF_KINDS.includes(r.kind as ShelfKind) ? (r.kind as ShelfKind) : "gondola";
    const shelf: ShelfLayout = {
      id: `shelf-${Date.now()}-${idx}`,
      label: r.label || `매대 ${idx + 1}`,
      x: px,
      y: py,
      width: pw,
      height: ph,
      bayCode: autoAssignBayCode(idx),
      kind,
      tierCount: r.tierCount && r.tierCount >= 1 && r.tierCount <= 6 ? r.tierCount : undefined,
      orientation: r.orientation === "H" || r.orientation === "V" ? r.orientation : undefined,
      category: r.category || undefined,
      detectedText: r.detectedText || undefined,
      confidence: r.confidence,
    };
    out.push(shelf);
    idx++;
  }
  return out;
}
