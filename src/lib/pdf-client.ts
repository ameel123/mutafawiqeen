"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";

let lib: Promise<typeof import("pdfjs-dist")> | null = null;

async function pdfjs() {
  if (!lib) {
    lib = import("pdfjs-dist/legacy/build/pdf.mjs").then((m) => {
      const mod = m as unknown as typeof import("pdfjs-dist");
      mod.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return mod;
    });
  }
  return lib;
}

export async function openPdf(data: ArrayBuffer | string): Promise<PDFDocumentProxy> {
  const m = await pdfjs();
  const src = typeof data === "string" ? { url: data } : { data: new Uint8Array(data) };
  return m.getDocument({ ...src, isEvalSupported: false }).promise;
}

/** Renders one page (1-based) to a JPEG blob about `width` pixels wide. */
export async function renderPage(doc: PDFDocumentProxy, n: number, width = 1100): Promise<Blob> {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("المتصفح لا يدعم الرسم");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  page.cleanup();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error("تعذر تحويل الصفحة إلى صورة");
  return blob;
}

/** Plain text of a page (Arabic text in some PDFs comes out scrambled; the admin reviews it). */
export async function pageText(doc: PDFDocumentProxy, n: number): Promise<string> {
  const page = await doc.getPage(n);
  const tc = await page.getTextContent();
  let out = "";
  let lastY: number | null = null;
  for (const it of tc.items as { str: string; transform: number[]; hasEOL?: boolean }[]) {
    if (!("str" in it)) continue;
    const y = it.transform?.[5];
    if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 4) out += "\n";
    out += it.str;
    if (it.hasEOL) out += "\n";
    lastY = y ?? lastY;
  }
  return out
    .normalize("NFKC")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
