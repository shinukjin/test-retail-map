/**
 * Google Cloud Vision API 호출 + 결과 정규화
 * API Key: https://console.cloud.google.com/apis/credentials
 * 활성화:  Cloud Vision API 사용 설정 필요
 */
import type { ShelfKind, ShelfLayout } from "@/domain/types";

// ---- Google Vision 응답 타입 ----

type NormalizedVertex = { x?: number; y?: number };
type Vertex = { x?: number; y?: number };

type LocalizedObjectAnnotation = {
  name: string;
  score: number;
  boundingPoly: { normalizedVertices: NormalizedVertex[] };
};

type TextAnnotation = {
  description: string;
  boundingPoly: { vertices: Vertex[] };
};

type LabelAnnotation = {
  description: string;
  score: number;
};

type GoogleVisionResponseItem = {
  localizedObjectAnnotations?: LocalizedObjectAnnotation[];
  textAnnotations?: TextAnnotation[];
  labelAnnotations?: LabelAnnotation[];
  error?: { message: string; code: number };
};

type GoogleVisionAPIResponse = {
  responses: GoogleVisionResponseItem[];
};

// ---- API 호출 ----

export async function callGoogleVisionAPI(
  imageBase64: string,
  apiKey: string,
): Promise<GoogleVisionAPIResponse> {
  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: imageBase64 },
            features: [
              { type: "OBJECT_LOCALIZATION", maxResults: 50 },
              { type: "TEXT_DETECTION", maxResults: 100 },
              { type: "LABEL_DETECTION", maxResults: 20 },
            ],
          },
        ],
      }),
    },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      (body as { error?: { message?: string } }).error?.message ??
      `Google Vision API 오류: ${res.status}`;
    throw new Error(msg);
  }

  return (await res.json()) as GoogleVisionAPIResponse;
}

// ---- 정규화 bbox 계산 ----

function normalizedVerticesToBbox(
  vertices: NormalizedVertex[],
): { x: number; y: number; w: number; h: number } | null {
  if (vertices.length < 2) return null;
  const xs = vertices.map((v) => v.x ?? 0);
  const ys = vertices.map((v) => v.y ?? 0);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const w = Math.max(...xs) - x;
  const h = Math.max(...ys) - y;
  if (w < 0.01 || h < 0.01) return null;
  return { x, y, w, h };
}

/** 절댓값 Vertex → normalized (이미지 크기로 나누기) */
function absoluteVerticesToNormalized(
  vertices: Vertex[],
  imgW: number,
  imgH: number,
): NormalizedVertex[] {
  return vertices.map((v) => ({
    x: (v.x ?? 0) / imgW,
    y: (v.y ?? 0) / imgH,
  }));
}

// ---- Kind 추정 ----

const KIND_MAP: [RegExp, ShelfKind][] = [
  [/refriger|cooler|chiller|freezer|냉장|냉동/i, "refrigerated"],
  [/produce|fresh|vegeta|fruit|신선|채소|과일/i, "produce"],
  [/endcap|end.?cap|단/i, "endcap"],
  [/gondola|rack|shelf|shelv|진열|매대/i, "gondola"],
];

function detectKind(name: string): ShelfKind {
  for (const [re, kind] of KIND_MAP) {
    if (re.test(name)) return kind;
  }
  return "gondola";
}

function autoAssignBayCode(idx: number): string {
  const letter = String.fromCharCode(65 + Math.floor(idx / 9));
  const num = (idx % 9) + 1;
  return `${letter}${num}`;
}

// ---- Google Vision 결과 → ShelfLayout[] ----

export function normalizeGoogleVisionResult(
  response: GoogleVisionAPIResponse,
  imageWidth: number,
  imageHeight: number,
): ShelfLayout[] {
  const resp = response.responses[0];
  if (!resp) throw new Error("Google Vision 응답이 비어 있습니다.");
  if (resp.error) throw new Error(`Google Vision 오류: ${resp.error.message}`);

  const objects = resp.localizedObjectAnnotations ?? [];
  const texts = resp.textAnnotations ?? [];
  const out: ShelfLayout[] = [];
  let idx = 0;

  const MIN_PX = 10;

  for (const obj of objects) {
    const bbox = normalizedVerticesToBbox(obj.boundingPoly?.normalizedVertices ?? []);
    if (!bbox) continue;

    const px = Math.round(bbox.x * imageWidth);
    const py = Math.round(bbox.y * imageHeight);
    const pw = Math.round(bbox.w * imageWidth);
    const ph = Math.round(bbox.h * imageHeight);
    if (pw < MIN_PX || ph < MIN_PX) continue;

    // 해당 객체 영역에 겹치는 텍스트 찾기 (첫 번째 textAnnotation은 전체 텍스트이므로 1부터)
    const overlappingTexts = texts.slice(1).filter((t) => {
      const nv = absoluteVerticesToNormalized(t.boundingPoly?.vertices ?? [], imageWidth, imageHeight);
      const tb = normalizedVerticesToBbox(nv);
      if (!tb) return false;
      const cx = tb.x + tb.w / 2;
      const cy = tb.y + tb.h / 2;
      return cx >= bbox.x && cx <= bbox.x + bbox.w && cy >= bbox.y && cy <= bbox.y + bbox.h;
    });

    const detectedText = overlappingTexts.map((t) => t.description).join(" ").trim();
    const label = detectedText || obj.name;
    const kind = detectKind(obj.name + " " + detectedText);

    out.push({
      id: `shelf-gv-${Date.now()}-${idx}`,
      label,
      x: px,
      y: py,
      width: pw,
      height: ph,
      bayCode: autoAssignBayCode(idx),
      kind,
    });
    idx++;
  }

  return out;
}

// ---- OpenAI 호환 regions 포맷으로 변환 (분석 Route에서 통일 포맷으로 반환) ----

export type NormalizedRegion = {
  label: string;
  kind: string;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
  detectedText?: string;
};

export function googleVisionToRegions(
  response: GoogleVisionAPIResponse,
): NormalizedRegion[] {
  const resp = response.responses[0];
  if (!resp || resp.error) return [];

  const objects = resp.localizedObjectAnnotations ?? [];
  const texts = resp.textAnnotations ?? [];
  const out: NormalizedRegion[] = [];

  for (const obj of objects) {
    const bbox = normalizedVerticesToBbox(obj.boundingPoly?.normalizedVertices ?? []);
    if (!bbox) continue;

    const overlapping = texts.slice(1).filter((t) => {
      if (!t.boundingPoly?.vertices?.length) return false;
      const xs = t.boundingPoly.vertices.map((v) => v.x ?? 0);
      const ys = t.boundingPoly.vertices.map((v) => v.y ?? 0);
      return (
        Math.min(...xs) < (bbox.x + bbox.w) &&
        Math.max(...xs) > bbox.x &&
        Math.min(...ys) < (bbox.y + bbox.h) &&
        Math.max(...ys) > bbox.y
      );
    });

    const detectedText = overlapping.map((t) => t.description).join(" ").trim();

    out.push({
      label: detectedText || obj.name,
      kind: detectKind(obj.name + " " + detectedText),
      confidence: obj.score,
      bbox,
      detectedText: detectedText || undefined,
    });
  }

  return out;
}
