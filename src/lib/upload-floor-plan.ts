export type UploadedFloorPlan = {
  imageUrl: string;
  width: number;
  height: number;
  mimeType: string;
};

export type UploadedPdf = UploadedFloorPlan & {
  totalPages: number;
};

const MAX_DIMENSION = 2048;

export function getFileKind(file: File): "image" | "pdf" | "dwg" | "unsupported" {
  const name = file.name.toLowerCase();
  const ext = name.split(".").pop() ?? "";
  if (file.type === "application/pdf" || ext === "pdf") return "pdf";
  if (ext === "dwg" || ext === "dxf") return "dwg";
  if (file.type.startsWith("image/")) return "image";
  return "unsupported";
}

export async function readFloorPlanFile(file: File): Promise<UploadedFloorPlan> {
  const originalUrl = await fileToDataUrl(file);
  const { width, height } = await measureImage(originalUrl);
  if (width <= 0 || height <= 0) throw new Error("이미지 크기를 읽을 수 없습니다.");
  if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
    return { imageUrl: originalUrl, width, height, mimeType: file.type };
  }
  const { dataUrl, w, h } = await resizeImage(originalUrl, width, height, MAX_DIMENSION);
  return { imageUrl: dataUrl, width: w, height: h, mimeType: "image/jpeg" };
}

/** PDF 파일을 지정 페이지(1-indexed)로 렌더링해 data URL로 반환합니다. (클라이언트 전용) */
export async function readPdfFile(file: File, pageNumber = 1): Promise<UploadedPdf> {
  const arrayBuffer = await file.arrayBuffer();

  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    // public/pdf.worker.min.mjs 로컬 파일 사용 (CDN 불필요)
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }

  const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const totalPages = pdf.numPages;
  const safePageNum = Math.max(1, Math.min(pageNumber, totalPages));
  const page = await pdf.getPage(safePageNum);

  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 컨텍스트 오류");

  // pdfjs-dist v4: canvasContext + viewport (canvas 파라미터 없음)
  await page.render({ canvasContext: ctx, viewport }).promise;

  let imageUrl = canvas.toDataURL("image/jpeg", 0.92);
  let w = canvas.width;
  let h = canvas.height;

  if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
    const resized = await resizeImage(imageUrl, w, h, MAX_DIMENSION);
    imageUrl = resized.dataUrl;
    w = resized.w;
    h = resized.h;
  }

  return { imageUrl, width: w, height: h, mimeType: "image/jpeg", totalPages };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("파일을 읽을 수 없습니다."));
    reader.readAsDataURL(file);
  });
}

function measureImage(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("이미지를 읽을 수 없습니다."));
    img.src = dataUrl;
  });
}

function resizeImage(
  dataUrl: string,
  origW: number,
  origH: number,
  maxDim: number,
): Promise<{ dataUrl: string; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const scale = Math.min(maxDim / origW, maxDim / origH);
    const w = Math.round(origW * scale);
    const h = Math.round(origH * scale);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas 컨텍스트 오류"));
      ctx.drawImage(img, 0, 0, w, h);
      resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.92), w, h });
    };
    img.onerror = () => reject(new Error("이미지 리사이즈 실패"));
    img.src = dataUrl;
  });
}

/** data URL → base64 문자열만 추출 (API 전송용) */
export function dataUrlToBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf(",");
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

/** data URL → mimeType 추출 */
export function dataUrlMimeType(dataUrl: string): string {
  const m = dataUrl.match(/^data:([^;]+);/);
  return m ? m[1] : "image/jpeg";
}
