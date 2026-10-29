import { jsPDF } from 'jspdf';
import { autoTable, type RowInput } from 'jspdf-autotable';
import { fmtDateCH, isoWeek, todayISO, weekdayIndex } from '@/engine/dates';
import type { PeriodSummary } from '@/engine/hours';
import { fmtHours, fmtSegments } from '@/engine/time';
import type { HoursFormat, Locale, Profile, ShiftType } from '@/engine/types';
import { DICTS } from '@/i18n';
import { formatDate } from '@/lib/format';

export interface ReportOptions {
  locale: Locale;
  includeRest: boolean;
  includeNotes: boolean;
  includeSignatures: boolean;
  includeLegend: boolean;
  hoursFormat: HoursFormat;
}

/** The standard PDF fonts only cover Latin-1: map typographic characters and drop the rest (emoji…). */
function latin1(text: string): string {
  return text
    .replace(/[’‘‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x00-\xFF]/g, '');
}

const INK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [102, 112, 133];
const LINE: [number, number, number] = [226, 229, 235];
const SOFT: [number, number, number] = [246, 247, 249];
const BRAND: [number, number, number] = [229, 34, 63];

/**
 * Builds the hours report handed to the employer: identity, period, totals and the day-by-day
 * detail. It deliberately contains no money amounts.
 */
export function buildHoursReport(summary: PeriodSummary, profile: Profile, types: Record<string, ShiftType>, opts: ReportOptions): jsPDF {
  const t = DICTS[opts.locale];
  const h = (min: number, zero = '-') => (min ? fmtHours(min / 60, opts.hoursFormat).replace('−', '-') : zero);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const rawText = doc.text.bind(doc);
  doc.text = ((text: string | string[], x: number, y: number, options?: unknown) =>
    rawText(Array.isArray(text) ? text.map(latin1) : latin1(text), x, y, options as never)) as typeof doc.text;
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  doc.setProperties({ title: `${t.report.docTitle} ${fmtDateCH(summary.start)}-${fmtDateCH(summary.end)}`, author: profile.name, creator: 'Swissync Turni' });

  // Header ------------------------------------------------------------------
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, W, 2.2, 'F');
  // Logo mark
  doc.setFillColor(...BRAND);
  doc.roundedRect(W - M - 9, 9, 9, 9, 2.2, 2.2, 'F');
  doc.setFillColor(255, 255, 255);
  doc.rect(W - M - 5.3, 10.9, 1.6, 5.2, 'F');
  doc.rect(W - M - 7.1, 12.7, 5.2, 1.6, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('Swissync Turni', W - M - 11, 14.6, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...INK);
  doc.text(t.report.docTitle, M, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(...MUTED);
  const periodLabel = `${formatDate(summary.start, 'd MMMM yyyy', opts.locale)} - ${formatDate(summary.end, 'd MMMM yyyy', opts.locale)}`;
  doc.text(periodLabel, M, 22.5);

  // Identity block ------------------------------------------------------------
  const info: [string, string][] = [
    [t.report.employee, profile.name || '—'],
    [t.report.employeeId, profile.employeeId || '—'],
    [t.report.employer, profile.employer || '—'],
    [t.report.department, profile.department || '—'],
  ];
  let y = 31;
  doc.setDrawColor(...LINE);
  doc.setFillColor(...SOFT);
  doc.roundedRect(M, y, W - 2 * M, 21, 2.5, 2.5, 'FD');
  const colW = (W - 2 * M) / 2;
  info.forEach(([label, value], i) => {
    const x = M + 5 + (i % 2) * colW;
    const yy = y + 7.6 + Math.floor(i / 2) * 9;
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), x, yy - 3.2);
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.text(value, x, yy + 1.4, { maxWidth: colW - 8 });
    doc.setFont('helvetica', 'normal');
  });
  y += 27;

  // Summary tiles ---------------------------------------------------------------
  const absences = summary.kindCounts.vacation + summary.kindCounts.sick + summary.kindCounts.holiday;
  const tiles: [string, string][] = [
    [t.report.totalHours, h(summary.workedMin, '0')],
    [t.report.workedDays, String(summary.daysWorked)],
    [t.report.nightHours, h(summary.nightMin, '0')],
    [t.report.sundayHours, h(summary.sundayMin, '0')],
    [t.report.holidayHours, h(summary.holidayMin, '0')],
  ];
  if (summary.overtimeMin) tiles.push([t.report.overtimeHours, h(summary.overtimeMin)]);
  if (summary.targetMin) tiles.push([t.report.balance, `${summary.balanceMin >= 0 ? '+' : ''}${fmtHours(summary.balanceMin / 60, opts.hoursFormat).replace('−', '-')}`]);
  if (absences) tiles.push([t.report.absences, t.common.days(absences)]);
  const perRow = Math.min(tiles.length, 4);
  const gap = 3;
  const tileW = (W - 2 * M - gap * (perRow - 1)) / perRow;
  tiles.forEach(([label, value], i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const x = M + col * (tileW + gap);
    const yy = y + row * 18;
    doc.setDrawColor(...LINE);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, yy, tileW, 15, 2.5, 2.5, 'FD');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(label, x + 4, yy + 5.5, { maxWidth: tileW - 6 });
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...(i === 0 ? BRAND : INK));
    doc.text(value, x + 4, yy + 12);
    doc.setFont('helvetica', 'normal');
  });
  y += Math.ceil(tiles.length / perRow) * 18 + 3;

  // Detail table ------------------------------------------------------------------
  const head = [t.report.date, t.report.weekday, t.report.shift, t.report.times, t.report.break, t.report.nightShort, t.report.hours];
  if (opts.includeNotes) head.push(t.report.note);
  const body: RowInput[] = [];
  let weekMin = 0;
  let weekNo = summary.days.length ? isoWeek(summary.days[0].date).week : 0;
  const pushWeek = () => {
    const row: RowInput = [
      { content: t.report.weekTotal(weekNo), colSpan: 6, styles: { fontStyle: 'bold', fillColor: SOFT, textColor: MUTED } },
      { content: h(weekMin, '0'), styles: { fontStyle: 'bold', fillColor: SOFT, halign: 'right' } },
    ];
    if (opts.includeNotes) row.push({ content: '', styles: { fillColor: SOFT } });
    body.push(row);
  };
  summary.days.forEach((d, i) => {
    const w = isoWeek(d.date).week;
    if (w !== weekNo) {
      pushWeek();
      weekNo = w;
      weekMin = 0;
    }
    const worked = d.kind === 'work' || d.kind === 'training';
    if (opts.includeRest || (d.entry && (worked || d.kind !== 'rest'))) {
      const holidayName = d.holiday ? (d.holiday.startsWith('custom:') ? d.holiday.slice(7) : t.holidays[d.holiday] ?? '') : '';
      const label = d.entry ? (d.type ? d.type.code : d.kind !== 'none' && !worked ? t.kinds[d.kind] : d.code) : '';
      const muted = !d.entry || !worked;
      const color = muted ? MUTED : INK;
      const notes = [holidayName, d.entry?.note ?? ''].filter(Boolean).join(' · ');
      const row: RowInput = [
        { content: fmtDateCH(d.date), styles: { textColor: color } },
        { content: t.weekdaysShort[weekdayIndex(d.date)], styles: { textColor: d.holiday || weekdayIndex(d.date) === 6 ? BRAND : color } },
        { content: label, styles: { fontStyle: 'bold', textColor: color } },
        { content: worked ? fmtSegments(d.segments).replace(/–/g, '-') : d.entry && d.type ? t.kinds[d.kind] : '', styles: { textColor: color } },
        { content: worked && d.breakMin ? `${d.breakMin}'` : '', styles: { textColor: MUTED, halign: 'right' } },
        { content: worked ? h(d.nightMin, '') : '', styles: { textColor: MUTED, halign: 'right' } },
        { content: worked ? h(d.workedMin) : d.creditedMin ? h(d.creditedMin) : '', styles: { fontStyle: 'bold', halign: 'right', textColor: color } },
      ];
      if (opts.includeNotes) row.push({ content: notes, styles: { textColor: MUTED, fontSize: 7.5 } });
      body.push(row);
    }
    weekMin += d.workedMin + d.creditedMin;
    if (i === summary.days.length - 1) pushWeek();
  });
  const totalRow: RowInput = [
    { content: t.report.total, colSpan: 6, styles: { fontStyle: 'bold', fillColor: INK, textColor: [255, 255, 255] } },
    { content: h(summary.workedMin + summary.creditedMin, '0'), styles: { fontStyle: 'bold', fillColor: INK, textColor: [255, 255, 255], halign: 'right' } },
  ];
  if (opts.includeNotes) totalRow.push({ content: '', styles: { fillColor: INK } });
  body.push(totalRow);

  const clean = (rows: RowInput[]): RowInput[] =>
    rows.map((row) => (row as unknown[]).map((c) => (c && typeof c === 'object' && 'content' in c ? { ...(c as object), content: latin1(String((c as { content: unknown }).content ?? '')) } : typeof c === 'string' ? latin1(c) : c)) as RowInput);
  autoTable(doc, {
    startY: y,
    head: clean([head]),
    body: clean(body),
    margin: { left: M, right: M, top: 16, bottom: 16 },
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 1.7, bottom: 1.7, left: 2, right: 2 }, textColor: INK, lineColor: LINE, lineWidth: { bottom: 0.15 } },
    headStyles: { fontStyle: 'bold', fontSize: 7.5, textColor: MUTED, fillColor: [255, 255, 255], lineWidth: { bottom: 0.4 }, lineColor: INK },
    columnStyles: {
      0: { cellWidth: 21 },
      1: { cellWidth: 14 },
      2: { cellWidth: 17 },
      3: { cellWidth: opts.includeNotes ? 'auto' : 'auto' },
      4: { cellWidth: 12, halign: 'right' },
      5: { cellWidth: 13, halign: 'right' },
      6: { cellWidth: 15, halign: 'right' },
      ...(opts.includeNotes ? { 7: { cellWidth: 38 } } : {}),
    },
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index >= 4 && data.column.index <= 6) data.cell.styles.halign = 'right';
    },
  });
  y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 8;

  const H = doc.internal.pageSize.getHeight();
  const ensure = (space: number) => {
    if (y + space > H - 18) {
      doc.addPage();
      y = 18;
    }
  };

  // Legend ----------------------------------------------------------------------
  if (opts.includeLegend) {
    const used = Object.keys(summary.typeCounts).map((id) => types[id]).filter(Boolean).sort((a, b) => a.code.localeCompare(b.code));
    if (used.length) {
      ensure(10 + Math.ceil(used.length / 2) * 5);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...INK);
      doc.text(t.report.legend, M, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      used.forEach((ty, i) => {
        const x = M + (i % 2) * colW;
        const yy = y + Math.floor(i / 2) * 4.6;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...INK);
        doc.text(ty.code, x, yy);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...MUTED);
        const desc = `${ty.name !== ty.code ? `${ty.name} · ` : ''}${ty.segments.length ? fmtSegments(ty.segments).replace(/–/g, '-') : t.kinds[ty.kind]}${ty.unpaidBreakMin ? ` (-${ty.unpaidBreakMin}')` : ''}`;
        doc.text(desc, x + 16, yy, { maxWidth: colW - 20 });
      });
      y += Math.ceil(used.length / 2) * 4.6 + 6;
    }
  }

  // Signatures ----------------------------------------------------------------------
  if (opts.includeSignatures) {
    ensure(34);
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(t.report.declaration, M, y);
    y += 16;
    const sigW = (W - 2 * M - 12) / 2;
    [t.report.signatureEmployee, t.report.signatureEmployer].forEach((label, i) => {
      const x = M + i * (sigW + 12);
      doc.setDrawColor(...INK);
      doc.setLineWidth(0.3);
      doc.line(x, y, x + sigW, y);
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(`${label}`, x, y + 4.5);
      doc.text(t.report.placeDate, x + sigW, y + 4.5, { align: 'right' });
    });
    y += 10;
  }

  // Footer on every page --------------------------------------------------------------
  const pages = doc.getNumberOfPages();
  const stamp = formatDate(todayISO(), 'd MMMM yyyy', opts.locale);
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`${t.report.generatedOn(stamp)} · ${profile.name}`, M, H - 8);
    doc.text(t.report.page(p, pages), W - M, H - 8, { align: 'right' });
  }
  return doc;
}

export function reportFileName(summary: PeriodSummary, profile: Profile): string {
  const who = (profile.name || 'turni').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');
  return `ore-${who}-${summary.start}_${summary.end}.pdf`;
}
