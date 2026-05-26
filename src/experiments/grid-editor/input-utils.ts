/** "05"→"5", "00"→"0". 빈 문자열은 그대로. */
export function normalizeUnsignedIntString(raw: string): string {
  if (raw === "") return "";
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return "";
  return String(n);
}

/** 픽셀 입력: 숫자만 남기고 parseInt로 선행 0 제거. 빈 문자열 허용 */
export function sanitizePixelDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits === "") return "";
  return String(parseInt(digits, 10));
}

/** type=number 빈 값은 null, 그 외는 parseInt로 선행 0 제거된 정수 */
export function parseNonNegInt(raw: string): number | null {
  if (raw === "" || raw.trim() === "") return null;
  const n = parseInt(raw.trim(), 10);
  if (Number.isNaN(n)) return null;
  return n;
}
