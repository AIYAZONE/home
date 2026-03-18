export type CsvParseResult = {
  headers: string[];
  rows: Record<string, string>[];
};

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function detectDelimiter(line: string): ',' | '\t' | ';' | '|' {
  const candidates: Array<',' | '\t' | ';' | '|'> = [',', '\t', ';', '|'];
  const scored = candidates
    .map((d) => ({ d, score: (line.match(new RegExp(`\\${d}`, 'g')) ?? []).length }))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.d ?? ',';
}

function parseCsvRows(text: string, delimiter: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };

  const pushRow = () => {
    if (row.length === 1 && row[0] === '') {
      row = [];
      return;
    }
    out.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i] ?? '';

    if (inQuotes) {
      if (c === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (c === delimiter) {
      pushField();
      i += 1;
      continue;
    }

    if (c === '\r') {
      if (text[i + 1] === '\n') {
        pushField();
        pushRow();
        i += 2;
        continue;
      }
      pushField();
      pushRow();
      i += 1;
      continue;
    }

    if (c === '\n') {
      pushField();
      pushRow();
      i += 1;
      continue;
    }

    field += c;
    i += 1;
  }

  pushField();
  if (row.length > 0) pushRow();
  return out;
}

export function parseCsv(text: string): CsvParseResult {
  const normalized = stripBom(text).trim();
  if (!normalized) return { headers: [], rows: [] };

  const firstLine = normalized.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
  const delimiter = detectDelimiter(firstLine);
  const grid = parseCsvRows(normalized, delimiter);
  const headers = (grid[0] ?? []).map((h) => h.trim()).filter((h) => h.length > 0);
  if (headers.length === 0) return { headers: [], rows: [] };

  const rows = (grid.slice(1) ?? [])
    .filter((r) => r.some((cell) => String(cell ?? '').trim().length > 0))
    .map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h] = String(r[idx] ?? '').trim();
      });
      return obj;
    });

  return { headers, rows };
}

