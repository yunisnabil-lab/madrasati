import * as XLSX from 'xlsx';

// Exports a real .xlsx file (not CSV) with sensible column widths and a
// right-to-left sheet layout when lang is Arabic. rows: array of arrays,
// first row is the header.
//
// Note: the free SheetJS build used here (npm 'xlsx') cannot write cell
// styling (bold, colors, borders) into the .xlsx — that's a paid-tier
// feature of the library. If a bold/colored header row is needed, it has
// to be applied by hand in Excel after opening the file.
// Section names are stored with raw punctuation such as "01/01" or
// "02[General]/1" — used as-is, a "/" in that string is read as a path
// separator by the browser's download mechanism, so a report scoped to
// that section can silently fail to save or land somewhere unexpected.
// Strip anything invalid in a filename on any OS.
function sanitizeFilename(name) {
  return String(name).replace(/[\u2066-\u2069]/g, '').replace(/[\\/:*?"<>|]/g, '-');
}

// Section labels carry invisible direction marks (see sections.js) that are
// only useful on screen and in print — keep them out of spreadsheet cells.
const stripMarks = (rows) => rows.map((r) => r.map((v) => (typeof v === 'string' ? v.replace(/[\u2066-\u2069]/g, '') : v)));

// One workbook with several sheets: sheets = [{ name, rows }].
export function exportXlsxSheets(filename, sheets, { lang = 'ar' } = {}) {
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: sheets.map(() => ({ RTL: lang === 'ar' })) };
  sheets.forEach(({ name, rows: rawRows }) => {
    const rows = stripMarks(rawRows);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const colCount = rows[0]?.length || 0;
    ws['!cols'] = Array.from({ length: colCount }, (_, c) => {
      // sample the first rows only: sizing over hundreds of thousands of rows is slow
      const longest = rows.slice(0, 500).reduce((max, r) => Math.max(max, String(r[c] ?? '').length), 0);
      return { wch: Math.min(Math.max(longest + 2, 8), 40) };
    });
    XLSX.utils.book_append_sheet(wb, ws, String(name).replace(/[\\/?*[\]:]/g, '-').slice(0, 31));
  });
  XLSX.writeFile(wb, sanitizeFilename(filename));
}

export function exportXlsx(filename, rawRows, { lang = 'ar', sheetName = 'Report' } = {}) {
  const rows = stripMarks(rawRows);
  const safeFilename = sanitizeFilename(filename);
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // column widths: size to the longest cell in each column (capped)
  const colCount = rows[0]?.length || 0;
  ws['!cols'] = Array.from({ length: colCount }, (_, c) => {
    const longest = rows.reduce((max, r) => Math.max(max, String(r[c] ?? '').length), 0);
    return { wch: Math.min(Math.max(longest + 2, 8), 40) };
  });

  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: lang === 'ar' }] };
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, safeFilename);
}
