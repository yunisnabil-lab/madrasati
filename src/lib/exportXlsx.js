import * as XLSX from 'xlsx';

// Exports a real .xlsx file (not CSV) with sensible column widths and a
// right-to-left sheet layout when lang is Arabic. rows: array of arrays,
// first row is the header.
//
// Note: the free SheetJS build used here (npm 'xlsx') cannot write cell
// styling (bold, colors, borders) into the .xlsx — that's a paid-tier
// feature of the library. If a bold/colored header row is needed, it has
// to be applied by hand in Excel after opening the file.
export function exportXlsx(filename, rows, { lang = 'ar', sheetName = 'Report' } = {}) {
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
  XLSX.writeFile(wb, filename);
}
