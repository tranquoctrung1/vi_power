import ExcelJS from 'exceljs';

export interface BomReportRow {
  hour: number;
  uab: number;
  ubc: number;
  uca: number;
  utb: number;
  itb: number;
  ia: number;
  ib: number;
  ic: number;
  p: number;
}

const THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' }, left: { style: 'thin' },
  bottom: { style: 'thin' }, right: { style: 'thin' },
};
const CENTER: Partial<ExcelJS.Alignment> = { vertical: 'middle', horizontal: 'center', wrapText: true };

// Matches original template: pale blue for company/title banner, solid accent blue + white
// bold text for the data-table header and the Min/Max/Trung bình summary rows.
const LIGHT_BLUE = 'FFDDEBF7';
const ACCENT_BLUE = 'FF4472C4';
const WHITE = 'FFFFFFFF';

function styleRange(ws: ExcelJS.Worksheet, r1: number, c1: number, r2: number, c2: number, opts: {
  bold?: boolean; size?: number; border?: boolean; fill?: string; fontColor?: string; align?: Partial<ExcelJS.Alignment>;
}) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getCell(r, c);
      cell.alignment = opts.align ?? CENTER;
      if (opts.bold || opts.size || opts.fontColor) {
        cell.font = { bold: !!opts.bold, size: opts.size ?? 11, color: opts.fontColor ? { argb: opts.fontColor } : undefined };
      }
      if (opts.border) cell.border = THIN;
      if (opts.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
    }
  }
}

export async function exportBomReport(
  deviceName: string,
  dateStr: string,
  rows: BomReportRow[],
): Promise<void> {
  const d = new Date(dateStr);
  const dateLabel = d.toLocaleDateString('vi-VN');

  const cols: ((r: BomReportRow) => number)[] = [
    r => r.uab, r => r.ubc, r => r.uca, r => r.utb, r => r.itb, r => r.ia, r => r.ib, r => r.ic, r => r.p,
  ];
  const min = (sel: (r: BomReportRow) => number) => Math.min(...rows.map(sel));
  const max = (sel: (r: BomReportRow) => number) => Math.max(...rows.map(sel));
  const avg = (sel: (r: BomReportRow) => number) => rows.reduce((s, r) => s + sel(r), 0) / (rows.length || 1);
  const round = (n: number) => Math.round(n * 100) / 100;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('BOM');
  ws.columns = [{ width: 24 }, ...Array.from({ length: 9 }, () => ({ width: 12 }))];

  // Header block
  ws.mergeCells(1, 1, 1, 2);
  ws.getCell(1, 1).value = 'NHÀ MÁY NƯỚC TÂN HIỆP\nTRẠM BƠM HÒA PHÚ';
  ws.mergeCells(1, 3, 1, 10);
  ws.getCell(1, 3).value = 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc';
  styleRange(ws, 1, 1, 1, 10, { bold: true, size: 11, fill: LIGHT_BLUE, border: true });
  ws.getRow(1).height = 42;

  ws.mergeCells(2, 1, 2, 10);
  ws.getCell(2, 1).value = 'THÔNG SỐ HOẠT ĐỘNG ĐỘNG CƠ BƠM NƯỚC SẠCH';
  styleRange(ws, 2, 1, 2, 10, { bold: true, size: 14, fill: LIGHT_BLUE });
  ws.getRow(2).height = 26;

  ws.getCell(3, 3).value = 'Ngày:';
  ws.getCell(3, 4).value = dateLabel;
  styleRange(ws, 3, 3, 3, 4, { bold: true, align: { horizontal: 'left', vertical: 'middle' } });

  ws.mergeCells(4, 1, 4, 10);
  ws.getCell(4, 1).value = deviceName;
  styleRange(ws, 4, 1, 4, 10, { bold: true, size: 13, fill: LIGHT_BLUE });
  ws.getRow(4).height = 22;

  // Table header
  const headerRow = 6;
  const headers = ['Thời gian\n(Giờ)', 'Uab\n(V)', 'Ubc\n(V)', 'Uca\n(V)', 'Utb\n(V)', 'Itb\n(A)', 'Ia\n(A)', 'Ib\n(A)', 'Ic\n(A)', 'P\n(KW)'];
  headers.forEach((h, i) => { ws.getCell(headerRow, i + 1).value = h; });
  styleRange(ws, headerRow, 1, headerRow, 10, { bold: true, border: true, fill: ACCENT_BLUE, fontColor: WHITE });
  ws.getRow(headerRow).height = 30;

  // Data rows
  rows.forEach((r, i) => {
    const rowIdx = headerRow + 1 + i;
    const vals = [r.hour, ...cols.map(sel => round(sel(r)))];
    vals.forEach((v, c) => { ws.getCell(rowIdx, c + 1).value = v; });
    styleRange(ws, rowIdx, 1, rowIdx, 10, { border: true, align: CENTER });
  });

  // Summary rows
  const summaryStart = headerRow + 1 + rows.length;
  const summaries: [string, (sel: (r: BomReportRow) => number) => number][] = [
    ['Min', min], ['Max', max], ['Trung bình', avg],
  ];
  summaries.forEach(([label, fn], i) => {
    const rowIdx = summaryStart + i;
    ws.getCell(rowIdx, 1).value = label;
    cols.forEach((sel, c) => { ws.getCell(rowIdx, c + 2).value = round(fn(sel)); });
    styleRange(ws, rowIdx, 1, rowIdx, 10, { bold: true, border: true, fill: ACCENT_BLUE, fontColor: WHITE });
  });

  // Signature block
  let r = summaryStart + summaries.length + 2;
  ws.mergeCells(r, 1, r, 10);
  ws.getCell(r, 1).value = `Ngày ${d.getDate()}, tháng ${d.getMonth() + 1}, năm ${d.getFullYear()}`;
  styleRange(ws, r, 1, r, 10, { align: { horizontal: 'right', vertical: 'middle' } });
  r += 1;

  ws.mergeCells(r, 1, r, 4);
  ws.getCell(r, 1).value = 'Họ tên Người trực ca';
  ws.mergeCells(r, 5, r, 7);
  ws.getCell(r, 5).value = 'Người kiểm tra';
  ws.mergeCells(r, 8, r, 10);
  ws.getCell(r, 8).value = 'Người phê duyệt';
  styleRange(ws, r, 1, r, 10, { bold: true });
  r += 1;

  ['CA 1', 'CA 2', 'CA 3\nKý tên'].forEach(label => {
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 1).alignment = CENTER;
    ws.getRow(r).height = label.includes('\n') ? 40 : 18;
    r += 1;
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BOM_${deviceName.replace(/\s+/g, '_')}_${dateStr}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
