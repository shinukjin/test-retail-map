export type MarketChain = "gs" | "everyday";

export type FloorPlanRef = {
  imageUrl: string;
  width: number;
  height: number;
};

/** 엑셀 매장도면식: 곤돌라 한 칸(열) 안에 1~4단 셀이 세로/가로로 배치 */
export type TierBandOrientation = "vertical" | "horizontal";

export type ShelfKind =
  | "gondola"
  | "refrigerated"
  | "endcap"
  | "produce"
  | "other";

export type ShelfGridSpan = {
  colFrom: number;
  colTo: number;
  rowFrom: number;
  rowTo: number;
};

export type ShelfLayout = {
  id: string;
  /** 도면에 표기되는 이름 (예: 스낵, 음료) */
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 매대/포션 코드 (예: A1, C2) */
  bayCode?: string;
  /** 열·구역 코드 (예: S1~S4) */
  sectionCode?: string;
  /** 엑셀 그리드 열/행 구간 (도면과 집기현황 시트 매핑용) */
  grid?: ShelfGridSpan;
  kind?: ShelfKind;
  /** 1~4단 셀 배열 방향 (기본: 세로 4행, 엑셀 예시와 동일) */
  tierBands?: TierBandOrientation;
  /** AI 감지 진열단 수 (1~6) */
  tierCount?: number;
  /** 매대 방향: H=가로, V=세로 */
  orientation?: "H" | "V";
  /** 상품 대분류 카테고리 */
  category?: string;
  /** 도면에서 감지된 텍스트 */
  detectedText?: string;
  /** AI 분석 신뢰도 */
  confidence?: number;
};

export type TierIndex = 1 | 2 | 3 | 4;

export type SalesByTier = Partial<Record<TierIndex, number>>;

export type ShelfSales = {
  total: number;
  byTier: SalesByTier;
};

/** POS/매출 시트와 조인할 때 쓰는 논리 위치 키 예시 */
export type ShelfLocationKey = {
  marketId: string;
  shelfId: string;
  bayCode?: string;
  sectionCode?: string;
  tier: TierIndex;
};

export type FloorFixture = {
  marketId: string;
  chain: MarketChain;
  name: string;
  floorPlan: FloorPlanRef;
  shelves: ShelfLayout[];
  salesByShelfId: Record<string, ShelfSales>;
};
