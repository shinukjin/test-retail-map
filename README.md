# test-retail-map

리테일 매장 **매대·구획 도면**을 가져오고, **격자 그리드**로 편집·조회하는 Next.js 실험 프로젝트입니다.  
Konva와 Fabric.js 두 가지 캔버스 구현을 나란히 비교할 수 있도록 구성되어 있습니다.

## 주요 기능

| 화면 | 경로 | 설명 |
|------|------|------|
| 도면 가져오기 | `/map-import` | PDF/이미지 도면 업로드, AI 분석, 매대 배치·세분화 후 Konva 그리드로 내보내기 |
| Konva 조회 | `/map-konva` | 저장된 Konva 그리드 스냅샷 뷰어 (줌·팬) |
| Konva 편집 | `/map-konva/editor` | 격자 생성·셀 편집·병합·이동·크기 조절 (메인 편집기) |
| Fabric 조회 | `/map-fabric` | Fabric 그리드 스냅샷 뷰어 |
| Fabric 편집 | `/map-fabric/editor` | Fabric 기반 그리드 편집기 (비교용) |

루트(`/`)는 `/map-konva`로 리다이렉트됩니다.

## 기술 스택

- **Next.js 16** (App Router)
- **React 19**, **TypeScript**
- **Tailwind CSS 4**
- **Konva** / **react-konva** — 주력 편집·조회
- **Fabric.js** — 비교 실험용
- **pdfjs-dist** — PDF 도면 변환

## 시작하기

### 요구 사항

- Node.js 20+
- npm

### 설치 및 실행

```bash
npm install
npm run dev
```

브라우저에서 [http://localhost:3100](http://localhost:3100) 을 엽니다.  
(개발 서버 포트는 **3100**입니다.)

### 빌드

```bash
npm run lint
npm run build
npm start
```

### 환경 변수 (도면 AI 분석)

도면 가져오기(`/map-import`)의 AI 분석 기능을 쓰려면 프로젝트 루트에 `.env.local`을 만들고 아래 키 중 필요한 것을 설정합니다.

| 변수 | 용도 |
|------|------|
| `OPENAI_API_KEY` | OpenAI Vision 도면 분석 |
| `GEMINI_API_KEY` | Gemini 도면 분석 (권장 대안) |
| `GOOGLE_VISION_API_KEY` | Google Cloud Vision |

키 이름과 설명은 `.env.example`을 참고하세요. **API 키는 저장소에 커밋하지 마세요.**

## Konva 편집기 사용법

### 그리드 만들기

1. `/map-konva/editor` 접속
2. 왼쪽 패널 **그리드** 탭에서 열·행·셀 크기 입력 후 **생성**
3. **저장** / **불러오기** / **JSON**으로 `localStorage` 및 파일 백업

### 마우스 조작

| 동작 | 방법 |
|------|------|
| 셀 선택 | 셀 클릭 (Ctrl/⌘: 다중, Shift: 범위) |
| 캔버스 팬 | 빈 배경에서 드래그 |
| 줌 | 마우스 휠 또는 툴바 ± / 맞춤 |
| 셀 이동 | 셀 **0.15초** 길게 누른 뒤 드래그 → 놓을 위치에서 적용 |
| 셀 크기(병합) | 셀 선택 후 **파란 핸들**(오른쪽·아래·모서리) 드래그 |

셀 **픽셀 크기**(`cellWidth` / `cellHeight`)는 왼쪽 **그리드** 탭 숫자 입력으로 조절합니다.  
핸들 드래그는 **colspan × rowspan**(몇 칸을 차지하는지)을 바꿉니다.

### 키보드 단축키 (편집기)

| 단축키 | 기능 |
|--------|------|
| Ctrl/⌘ + Z | 되돌리기 |
| Ctrl/⌘ + Shift + Z / Ctrl/⌘ + Y | 다시 실행 |
| Ctrl/⌘ + C / X / V | 복사 / 잘라내기 / 붙여넣기 |
| Ctrl/⌘ + Shift + C / V | 디자인만 복사 / 붙여넣기 |
| Ctrl/⌘ + D | 복제 |
| Ctrl/⌘ + A | 전체 선택 |
| 방향키 | 선택 영역 확장 |
| Delete / Backspace | 선택 내용 지우기 |
| Esc | 선택 해제 |

## 도면 가져오기 흐름

1. PDF 또는 이미지 업로드
2. AI로 매대·구획 영역 분석 (선택한 provider)
3. 캔버스에서 매대 위치·크기 조정, 구획 세분화
4. Konva 그리드로 변환 후 편집기에서 계속 작업

관련 API:

- `POST /api/floor-plan/analyze` — 도면 영역 분석
- `POST /api/floor-plan/convert` — PDF → 이미지
- `POST /api/floor-plan/generate` — 도면 생성(실험)

## 프로젝트 구조

```
src/
├── app/                    # Next.js 라우트·API
│   ├── map-import/         # 도면 import
│   ├── map-konva/          # Konva 조회·편집
│   ├── map-fabric/         # Fabric 조회·편집
│   └── api/floor-plan/     # 도면 분석 API
├── components/             # 공통 UI (AppTopNav 등)
├── domain/                 # 도메인 타입·스냅샷
├── experiments/
│   ├── konva/              # Konva 캔버스·편집기
│   ├── fabric/             # Fabric 실험
│   ├── grid-editor/        # 공통 그리드 모델·클립보드·단축키
│   └── floor-import/       # 도면 import UI·모델
└── lib/                    # 도면 변환·Vision·세분화 유틸
```

### Konva 편집 관련 핵심 파일

| 파일 | 역할 |
|------|------|
| `experiments/konva/GridEditorKonva.tsx` | 캔버스, 팬/줌, 셀 이동·리사이즈 포인터 처리 |
| `experiments/grid-editor/useGridEditorModel.ts` | 그리드 상태, undo, 병합, 이동·리사이즈 API |
| `experiments/grid-editor/grid-clipboard-utils.ts` | 복사·붙여넣기·이동 |
| `experiments/grid-editor/grid-resize-utils.ts` | 마우스 병합 크기 조절 |
| `experiments/konva/KonvaEditorSidePanel.tsx` | 탭형 사이드 패널 (선택 / 그리드 / 스타일) |

## 데이터 저장

- Konva 편집기: `localStorage` (`konva-grid-editor` 키)
- Fabric 편집기: 별도 키 (Konva에서 교차 불러오기 지원)
- 도면 import: JSON 저장/불러오기

스냅샷 형식은 `experiments/konva/grid-snapshot.ts`를 참고하세요.

## 개발 규칙

- `AGENTS.md` — 코딩·작업 규칙
- 공통 DTO·API 응답 구조 임의 변경 금지
- Konva 기능 추가 시 Fabric 영향 최소화

## 라이선스

Private project (`package.json` `"private": true`).
