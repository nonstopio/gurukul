import type * as PdfJsModule from 'pdfjs-dist';
import { paintPixels } from './canvas';
import type { Pixels } from './canvas';

/** The part of pdf.js used here: the real module satisfies it, and tests pass a stub. */
export type PdfJs = typeof PdfJsModule;

/**
 * pdf.js and its worker, fetched only now. This is the one place either is imported, and only
 * through `import()`, so Vite gives them their own chunks: learners and the initial bundle never
 * load them, and an Educator downloads them only when a PDF is picked.
 */
export const loadPdfJs = async (): Promise<PdfJs> => {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
};

/**
 * Page 1 of a PDF drawn so its long side is `longEdge` pixels (the aspect kept), as RGBA. Null for a
 * PDF with no pages or a browser with no canvas; pdf.js throws for an encrypted or damaged file.
 * `load` is injectable so tests need no real pdf.js.
 */
export async function renderFirstPage(
  file: Blob,
  longEdge: number,
  load: () => Promise<PdfJs> = loadPdfJs,
): Promise<Pixels | null> {
  const pdfjs = await load();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const doc = await task.promise;
    if (doc.numPages < 1) return null;
    const page = await doc.getPage(1);
    const natural = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({
      scale: longEdge / Math.max(natural.width, natural.height),
    });
    const width = Math.max(1, Math.round(viewport.width));
    const height = Math.max(1, Math.round(viewport.height));
    return await paintPixels(width, height, (canvasContext, canvas) =>
      page.render({ canvas, canvasContext, viewport }).promise.then(() => undefined),
    );
  } finally {
    await task.destroy();
  }
}
