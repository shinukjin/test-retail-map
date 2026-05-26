/**
 * POST /api/floor-plan/convert
 * DWG / DXF 파일을 PNG로 변환합니다.
 * LibreOffice (soffice) 가 설치된 경우에만 동작합니다.
 *
 * 설치 안내:
 *   Windows: https://www.libreoffice.org/download/download/
 *   Mac:     brew install --cask libreoffice
 *   Ubuntu:  sudo apt install libreoffice
 */
import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

const SOFFICE_CANDIDATES =
  process.platform === "win32"
    ? [
        "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
        "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
        "soffice",
      ]
    : ["/usr/bin/soffice", "/usr/local/bin/soffice", "soffice"];

async function findSoffice(): Promise<string | null> {
  for (const candidate of SOFFICE_CANDIDATES) {
    try {
      await execFileAsync(candidate, ["--version"], { timeout: 5000 });
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

async function convertWithLibreOffice(inputPath: string, outputDir: string): Promise<string> {
  const soffice = await findSoffice();
  if (!soffice) {
    throw new Error(
      "LibreOffice가 설치되어 있지 않습니다.\n" +
        "설치 방법:\n" +
        "  Windows: https://www.libreoffice.org/download/download/\n" +
        "  DWG 파일을 직접 PDF/PNG로 변환 후 업로드하셔도 됩니다.",
    );
  }

  await execFileAsync(
    soffice,
    ["--headless", "--convert-to", "png", "--outdir", outputDir, inputPath],
    { timeout: 60_000 },
  );

  const stem = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(outputDir, `${stem}.png`);

  try {
    await fs.access(outputPath);
  } catch {
    throw new Error("LibreOffice 변환 후 출력 파일을 찾을 수 없습니다. DWG 형식이 지원되지 않을 수 있습니다.");
  }

  return outputPath;
}

/** PNG 바이너리에서 width/height 읽기 (IHDR 청크 위치 고정) */
function readPngDimensions(buf: Buffer): { width: number; height: number } {
  if (buf.length < 24) return { width: 0, height: 0 };
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

export async function POST(req: Request): Promise<NextResponse> {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "요청 파싱 오류" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
  }

  const ext = path.extname(file.name).toLowerCase();
  if (![".dwg", ".dxf"].includes(ext)) {
    return NextResponse.json(
      { error: ".dwg 또는 .dxf 파일만 변환 가능합니다." },
      { status: 400 },
    );
  }

  const tmpDir = os.tmpdir();
  const uniqueId = `fp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const inputPath = path.join(tmpDir, `${uniqueId}${ext}`);
  let outputPath: string | null = null;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(inputPath, buffer);

    outputPath = await convertWithLibreOffice(inputPath, tmpDir);

    const pngBuffer = await fs.readFile(outputPath);
    const base64 = pngBuffer.toString("base64");
    const { width, height } = readPngDimensions(pngBuffer);

    return NextResponse.json({
      imageBase64: base64,
      mimeType: "image/png",
      width,
      height,
      originalName: file.name,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "변환 오류";
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    await fs.unlink(inputPath).catch(() => undefined);
    if (outputPath) await fs.unlink(outputPath).catch(() => undefined);
  }
}
