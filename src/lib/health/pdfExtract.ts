let workerConfigured = false;

export async function extractTextFromPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
    workerConfigured = true;
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  const lines: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageLines = (textContent.items ?? [])
      .map((item: any) => String(item?.str ?? '').trim())
      .filter(Boolean);
    if (pageLines.length > 0) lines.push(...pageLines);
  }

  return lines.join('\n');
}
