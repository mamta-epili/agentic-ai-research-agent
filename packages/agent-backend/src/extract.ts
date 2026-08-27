import { createRequire } from "node:module";

// Extract plain text from an uploaded file so it can become searchable corpus
// content. PDFs use pdf-parse; text files are read directly; images are OCR'd
// with tesseract.js ONLY when OCR_ENABLED=true (it pulls a language model on
// first use, so it's opt-in to keep the backend lean). Dependencies are
// require()'d lazily so they only load when actually exercised.

const nodeRequire = createRequire(import.meta.url);

function ocrEnabled(): boolean {
  return String(process.env.OCR_ENABLED ?? "").toLowerCase() === "true";
}

export async function extractText(
  buffer: Buffer,
  mimetype: string,
  filename: string,
): Promise<string> {
  const name = filename.toLowerCase();

  if (mimetype === "application/pdf" || name.endsWith(".pdf")) {
    const pdfParse = nodeRequire("pdf-parse");
    const data = await pdfParse(buffer);
    return String(data.text ?? "").trim();
  }

  if (mimetype.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md")) {
    return buffer.toString("utf8").trim();
  }

  if (mimetype.startsWith("image/")) {
    if (!ocrEnabled()) {
      throw new Error(
        "Image OCR is disabled. Set OCR_ENABLED=true in .env (and install tesseract.js) to extract text from images.",
      );
    }
    let createWorker: (lang: string) => Promise<{
      recognize: (b: Buffer) => Promise<{ data: { text: string } }>;
      terminate: () => Promise<unknown>;
    }>;
    try {
      ({ createWorker } = nodeRequire("tesseract.js"));
    } catch {
      throw new Error(
        "OCR is enabled but tesseract.js is not installed. Run: npm install tesseract.js -w agent-backend",
      );
    }
    const worker = await createWorker("eng");
    try {
      const { data } = await worker.recognize(buffer);
      return String(data.text ?? "").trim();
    } finally {
      await worker.terminate();
    }
  }

  throw new Error(`Unsupported file type: ${mimetype || filename}`);
}
