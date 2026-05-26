import { NextResponse } from "next/server";

const GENERATE_PROMPT = `You are a retail store floor plan visualization expert.
Analyze this retail floor plan image carefully and create a clean, simplified SVG diagram showing the store layout.

Requirements:
- Use SVG viewBox="0 0 800 600" width="800" height="600"
- Light gray floor background: <rect fill="#f1f5f9" width="800" height="600"/>
- Grid lines every 50px: thin lines (#cbd5e1, opacity=0.6)
- Outer walls: dark border rectangle (#475569, strokeWidth=3, fill=none)
- For each shelf/gondola/fixture area: draw a filled rectangle with a text label
  - gondola/일반 매대: fill="#1d4ed8", text fill="white"
  - refrigerated/냉장: fill="#0891b2", text fill="white"
  - produce/신선: fill="#15803d", text fill="white"
  - endcap/앤드캡: fill="#c2410c", text fill="white"
  - other: fill="#6d28d9", text fill="white"
- Text labels: font-size=11, font-family=sans-serif, font-weight=bold, centered in each rectangle
- Label in Korean (e.g. 음료, 과자, 냉동, 신선, 세제, etc.)
- Include a small legend in the top-right corner
- Positions should match the actual layout in the floor plan image
- Do NOT include cashiers, entrances, or corridors as shelf areas

Return ONLY the SVG XML string starting with <svg and ending with </svg>. No explanation, no markdown.`;

type GenerateRequest = {
  imageBase64: string;
  mimeType: string;
  width: number;
  height: number;
};

export async function POST(req: Request): Promise<NextResponse> {
  let body: GenerateRequest;
  try {
    body = (await req.json()) as GenerateRequest;
  } catch {
    return NextResponse.json({ error: "요청 파싱 오류" }, { status: 400 });
  }

  const { imageBase64, mimeType, width, height } = body;
  if (!imageBase64 || !mimeType) {
    return NextResponse.json({ error: "필수 파라미터 누락" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY 환경변수가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const normalizedMime = mimeType === "image/jpg" ? "image/jpeg" : mimeType;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `${GENERATE_PROMPT}\n\n도면 크기: ${width}x${height}px`,
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
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const data = await res.json();
    let content: string = data.choices?.[0]?.message?.content ?? "";
    if (!content) {
      return NextResponse.json({ error: "OpenAI 응답이 비어 있습니다." }, { status: 502 });
    }

    // 마크다운 코드블록 제거
    content = content.replace(/^```(?:svg|xml)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

    // SVG 태그 시작 확인
    const svgStart = content.indexOf("<svg");
    if (svgStart < 0) {
      return NextResponse.json(
        { error: `SVG 형식이 아닌 응답:\n${content.slice(0, 300)}` },
        { status: 502 },
      );
    }

    const svg = content.slice(svgStart);
    return NextResponse.json({ svg, tokensUsed: data.usage?.total_tokens ?? 0 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "내부 서버 오류";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
