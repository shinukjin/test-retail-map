import { NextResponse } from "next/server";
import { callGoogleVisionAPI, googleVisionToRegions } from "@/lib/google-vision";

export const maxDuration = 180; // 3분 (Vercel 등 배포 환경용)

// ---- OpenAI 프롬프트 ----

const OPENAI_SYSTEM_PROMPT = `You are an expert retail store floor plan analyzer with deep knowledge of Korean supermarkets and convenience stores.

Analyze the floor plan image in extreme detail and identify EVERY individual shelf section, gondola, refrigerated case, endcap, produce area, checkout counter area, and any other retail fixture or zone.

For EACH identified region, provide ALL of the following fields:
- label: descriptive name in Korean (e.g., "음료", "스낵", "냉장 음료", "신선식품", "세제/생활용품", "계산대")
- kind: one of "gondola" | "refrigerated" | "endcap" | "produce" | "checkout" | "storage" | "other"
- bbox: normalized coordinates 0.0~1.0 as {x, y, w, h} (x,y = top-left corner)
- confidence: 0.0~1.0
- detectedText: any Korean/English text visible in that area on the floor plan
- tierCount: estimated number of shelf tiers/levels (1~6, default 4 for gondola)
- orientation: "H" for horizontal shelf run, "V" for vertical
- category: broad product category in Korean (e.g., "식품", "음료", "냉장·냉동", "신선", "생활용품", "기타")

Critical rules:
1. Detect EVERY labeled zone — do NOT skip any section
2. Split large gondola runs with multiple labels into SEPARATE regions
3. Include checkout/계산대, service counters, bakery, deli sections
4. Detect each refrigerated unit separately
5. Small endcap displays should be separate regions
6. Return ALL detected regions without limiting the count

Respond ONLY with valid JSON:
{"regions": [{"label": string, "kind": string, "bbox": {"x": number, "y": number, "w": number, "h": number}, "confidence": number, "detectedText": string, "tierCount": number, "orientation": string, "category": string}]}`;

// ---- 공통 타입 ----

type AnalyzeRequest = {
  imageBase64: string;
  mimeType: string;
  width: number;
  height: number;
  provider?: "openai" | "google" | "gemini";
};

// ---- OpenAI Vision 호출 ----

async function analyzeWithOpenAI(
  imageBase64: string,
  mimeType: string,
  width: number,
  height: number,
  apiKey: string,
): Promise<{ regions: unknown[]; model: string; tokensUsed: number }> {
  const normalizedMime = mimeType === "image/jpg" ? "image/jpeg" : mimeType;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: OPENAI_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `이 매장 도면 이미지(${width}x${height}px)에서 모든 매대 영역을 찾아 JSON으로 반환하세요.`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${normalizedMime};base64,${imageBase64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "OpenAI API 오류" } }));
    const msg = (err as { error?: { message?: string } }).error?.message ?? "OpenAI API 오류";
    throw new Error(msg);
  }

  const data = await res.json();
  const content: string = data.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("OpenAI 응답이 비어 있습니다.");

  let parsed: { regions?: unknown[] };
  try {
    parsed = JSON.parse(content) as { regions?: unknown[] };
  } catch {
    throw new Error(`OpenAI 응답 파싱 실패: ${content.slice(0, 200)}`);
  }

  return {
    regions: parsed.regions ?? [],
    model: "gpt-4o",
    tokensUsed: (data.usage?.total_tokens as number) ?? 0,
  };
}

// ---- Google Vision 호출 (참고: 도면 분석에 부적합 - 실물 사진 객체 인식 전용) ----

async function analyzeWithGoogle(
  imageBase64: string,
  apiKey: string,
): Promise<{ regions: unknown[]; model: string; _rawGoogleVision?: unknown }> {
  const response = await callGoogleVisionAPI(imageBase64, apiKey);
  const regions = googleVisionToRegions(response);
  return { regions, model: "google-vision", _rawGoogleVision: response };
}

// ---- Gemini Vision 호출 (도면 분석에 적합) ----

const GEMINI_SYSTEM_PROMPT = `You are an expert retail store floor plan analyzer with deep knowledge of Korean supermarkets and convenience stores.

Analyze the floor plan image in extreme detail and identify EVERY individual shelf section, gondola, refrigerated case, endcap, produce area, checkout counter area, and any other retail fixture or zone.

For EACH identified region, provide ALL of the following fields:
- label: descriptive name in Korean (e.g., "음료", "스낵", "냉장 음료", "신선식품", "세제/생활용품", "계산대")
- kind: one of "gondola" | "refrigerated" | "endcap" | "produce" | "checkout" | "storage" | "other"
- bbox: normalized coordinates 0.0~1.0 as {x, y, w, h} (x,y = top-left corner, w=width, h=height relative to image)
- confidence: 0.0~1.0
- detectedText: any Korean/English text visible in that area on the floor plan (shelf labels, codes, numbers)
- tierCount: estimated number of shelf tiers/levels (1~6, default 4 for gondola)
- orientation: "H" for horizontal shelf runs (wider than tall), "V" for vertical (taller than wide)
- category: broad product category in Korean (e.g., "식품", "음료", "냉장·냉동", "신선", "생활용품", "의류", "기타")

Critical rules:
1. Detect EVERY labeled zone on the floor plan — do NOT skip any section
2. If a large gondola run has multiple labeled sections (e.g., 음료, 과자, 라면), split them into SEPARATE regions
3. Include checkout/계산대 areas, service counters, bakery, deli sections
4. For refrigerated sections along walls, detect each individual refrigerated unit separately
5. Small endcap displays at gondola ends should be separate regions
6. Normalize ALL bbox values to 0.0~1.0 range
7. Return ALL detected regions — do not limit the count
8. If text labels are visible in the floor plan (Korean characters, shelf codes), include them in detectedText

Return ONLY a valid complete JSON object:
{"regions": [{"label": string, "kind": string, "bbox": {"x": number, "y": number, "w": number, "h": number}, "confidence": number, "detectedText": string, "tierCount": number, "orientation": string, "category": string}]}`;

const GEMINI_MODEL = "gemini-2.5-pro";

async function analyzeWithGemini(
  imageBase64: string,
  mimeType: string,
  apiKey: string,
): Promise<{ regions: unknown[]; model: string }> {
  const normalizedMime = mimeType === "image/jpg" ? "image/jpeg" : mimeType;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000); // 3분 타임아웃

  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: GEMINI_SYSTEM_PROMPT },
                { inline_data: { mime_type: normalizedMime, data: imageBase64 } },
              ],
            },
          ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 65536,
        },
        }),
      },
    );
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("Gemini 요청 타임아웃 (25초)");
    throw e;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg =
      (err as { error?: { message?: string } }).error?.message ??
      `Gemini API 오류 ${res.status}: API 키가 AI Studio 키인지 확인하세요 (aistudio.google.com/apikey)`;
    throw new Error(msg);
  }

  const data = await res.json();

  // 응답 구조 디버깅
  const candidate = data.candidates?.[0];
  const finishReason = candidate?.finishReason ?? "UNKNOWN";
  console.log(`[Gemini] finishReason=${finishReason}, candidate keys:`, JSON.stringify(Object.keys(candidate ?? {})));

  if (finishReason === "SAFETY") {
    throw new Error("Gemini 안전 필터에 의해 응답이 차단됐습니다. 다른 이미지를 시도하세요.");
  }
  if (finishReason === "RECITATION") {
    throw new Error("Gemini RECITATION 오류. 다시 시도하세요.");
  }

  // parts 배열에서 텍스트 추출
  const parts: { text?: string }[] = candidate?.content?.parts ?? [];
  const content: string = parts.map((p) => p.text ?? "").join("").trim();

  if (!content) {
    console.error("[Gemini] 빈 응답. 전체 data:", JSON.stringify(data).slice(0, 500));
    throw new Error(`Gemini 응답이 비어 있습니다. finishReason=${finishReason}`);
  }

  // JSON 코드블록 제거 후 파싱
  const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  let regions: unknown[] = [];
  try {
    const parsed = JSON.parse(cleaned) as { regions?: unknown[] };
    regions = parsed.regions ?? [];
  } catch {
    // MAX_TOKENS로 잘린 경우: 완성된 region 객체만 추출
    console.warn("[Gemini] JSON 파싱 실패, 부분 복구 시도...");
    const matches = cleaned.match(/\{[^{}]*"label"[^{}]*"bbox"[^{}]*\}/g) ?? [];
    for (const m of matches) {
      try { regions.push(JSON.parse(m)); } catch { /* skip */ }
    }
    if (regions.length === 0) {
      console.error("[Gemini] 복구 실패. 원문:", cleaned.slice(0, 500));
      throw new Error(`Gemini 응답 파싱 실패 (MAX_TOKENS로 잘렸을 수 있음): ${cleaned.slice(0, 200)}`);
    }
    console.log(`[Gemini] 부분 복구 성공: ${regions.length}개 region`);
  }

  return { regions, model: GEMINI_MODEL };
}

// ---- Route Handler ----

export async function POST(req: Request): Promise<NextResponse> {
  let body: AnalyzeRequest;
  try {
    body = (await req.json()) as AnalyzeRequest;
  } catch {
    return NextResponse.json({ error: "요청 파싱 오류" }, { status: 400 });
  }

  const { imageBase64, mimeType, width, height, provider = "openai" } = body;
  if (!imageBase64 || !mimeType || !width || !height) {
    return NextResponse.json({ error: "필수 파라미터 누락" }, { status: 400 });
  }

  try {
    if (provider === "google") {
      const apiKey = process.env.GOOGLE_VISION_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: "GOOGLE_VISION_API_KEY 환경변수가 설정되지 않았습니다." },
          { status: 503 },
        );
      }
      const result = await analyzeWithGoogle(imageBase64, apiKey);
      return NextResponse.json(result);
    } else if (provider === "gemini") {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: "GEMINI_API_KEY 환경변수가 설정되지 않았습니다.\nhttps://aistudio.google.com/apikey 에서 무료 발급 후 .env.local에 추가하세요." },
          { status: 503 },
        );
      }
      const result = await analyzeWithGemini(imageBase64, mimeType, apiKey);
      return NextResponse.json(result);
    } else {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: "OPENAI_API_KEY 환경변수가 설정되지 않았습니다." },
          { status: 503 },
        );
      }
      const result = await analyzeWithOpenAI(imageBase64, mimeType, width, height, apiKey);
      return NextResponse.json(result);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "내부 서버 오류";
    console.error(`[floor-plan/analyze] provider=${provider} error:`, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
