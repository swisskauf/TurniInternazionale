import { it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { summarize } from '@/engine/hours';
import { createHolidayLookup } from '@/engine/holidays';
import { legacyTypes } from '@/engine/presets';
import type { ShiftEntry } from '@/engine/types';
import { defaultProfile } from '@/store/store';
import { buildHoursReport } from './pdf';

// Dev helper: GEN_PDF=1 npx vitest run src/report → sample PDFs in $TMPDIR/swissync-turni-pdf
it.skipIf(!process.env.GEN_PDF)('generates a sample report', () => {
  const out = join(tmpdir(), 'swissync-turni-pdf');
  mkdirSync(out, { recursive: true });
  const types = legacyTypes();
  const map = Object.fromEntries(types.map((t) => [t.id, t]));
  const codes = ['P1', 'P2', 'GR', 'R+P1', 'MP1', 'GR', 'P3', 'AN', 'P1', 'GV'];
  const entries: Record<string, ShiftEntry> = {};
  for (let d = 1; d <= 30; d++) {
    const date = `2026-11-${String(d).padStart(2, '0')}`;
    const t = types.find((x) => x.code === codes[d % codes.length])!;
    entries[date] = { date, typeId: t.id, code: t.code, origin: 'import', updatedAt: 0, note: d === 12 ? 'Chiusura inventario' : undefined };
  }
  const holidayOf = createHolidayLookup({ country: 'CH', region: 'TI', customHolidays: [], ignoredHolidays: [] });
  const s = summarize('2026-11-01', '2026-11-30', entries, map, { holidayOf, nightStart: '23:00', nightEnd: '06:00', weeklyHours: 42, workDaysPerWeek: 5, overtimeRule: 'none', overtimeDailyHours: 0 });
  const profile = { ...defaultProfile(), name: 'Mario Rossi', employer: 'Gastronomia Lugano SA', employeeId: '10482', department: 'Banco gastronomia' };
  for (const locale of ['it', 'de'] as const) {
    const doc = buildHoursReport(s, profile, map, { locale, includeRest: false, includeNotes: true, includeSignatures: true, includeLegend: true, hoursFormat: 'decimal' });
    writeFileSync(join(out, `report-${locale}.pdf`), Buffer.from(doc.output('arraybuffer')));
  }
});
