import * as XLSX from 'xlsx';

export function exportXLSX(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
  sheetName = 'Sheet1',
): void {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = headers.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}
