export async function extractTextFromImage(file: File): Promise<string> {
  const Tesseract: any = await import('tesseract.js');
  const result = await Tesseract.recognize(file, 'chi_sim+eng');
  const raw = String(result?.data?.text ?? '');
  return raw
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}
