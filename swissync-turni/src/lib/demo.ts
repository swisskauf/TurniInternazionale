import { addDays, fromISO, monthRange, todayISO } from '@/engine/dates';
import { legacyScattaTurniProfile, legacyTypes } from '@/engine/presets';
import { newScript } from '@/engine/recognition/scripts';
import type { Locale, ShiftEntry, ShiftType } from '@/engine/types';
import { defaultProfile, useStore } from '@/store/store';

/** Fills the app with two realistic months (used for demos and store screenshots). */
export function loadDemo(locale: Locale) {
  const types = legacyTypes();
  const byCode = Object.fromEntries(types.map((t) => [t.code, t])) as Record<string, ShiftType>;
  const night: ShiftType = { ...byCode.P1, id: 'demo-night', code: 'N', name: locale === 'de' ? 'Nacht' : locale === 'fr' ? 'Nuit' : locale === 'en' ? 'Night' : 'Notte', color: 'indigo', segments: [{ start: '22:00', end: '06:30' }], unpaidBreakMin: 30 };
  types.push(night);
  const typeMap = Object.fromEntries(types.map((t) => [t.id, t]));
  const rotation = ['P1', 'P2', 'R+P1', 'GR', 'P3', 'MP1', 'GR', 'P2', 'N', 'N', 'GR', 'GR', 'AN', 'P1'];
  const today = todayISO();
  const d = fromISO(today);
  const prev = monthRange(d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear(), d.getMonth() === 0 ? 12 : d.getMonth());
  const cur = monthRange(d.getFullYear(), d.getMonth() + 1);
  const entries: Record<string, ShiftEntry> = {};
  let i = 0;
  for (let date = prev.start; date <= addDays(cur.end, 10); date = addDays(date, 1), i++) {
    let code = rotation[i % rotation.length];
    if (date === addDays(today, 9) || date === addDays(today, 10)) code = 'GV';
    const t = byCode[code] ?? night;
    entries[date] = { date, typeId: t.id, code: t.code, origin: 'import', updatedAt: Date.now() };
  }
  const changed = addDays(today, 3);
  if (entries[changed]) entries[changed] = { ...entries[changed], typeId: byCode.P2.id, code: 'P2', changedFrom: 'GR' };
  const overtime = addDays(today, -2);
  if (entries[overtime]) entries[overtime] = { ...entries[overtime], typeId: byCode.P1.id, code: 'P1', segments: [{ start: '08:00', end: '12:00' }, { start: '12:36', end: '18:30' }], manual: true, note: locale === 'it' ? 'Chiusura inventario' : 'Inventory' };
  entries[addDays(today, 5)] = { date: addDays(today, 5), code: 'X7', origin: 'import', updatedAt: Date.now() };

  const script = newScript({
    id: 'demo-script',
    name: 'Gastronomia Lugano',
    createdBy: 'ai',
    keywords: ['gastronomia', 'lugano'],
    personLabel: 'ROSSI M.',
    codeMap: [{ from: 'Pl', to: 'P1' }, { from: 'R+Pl', to: 'R+P1' }],
    stats: { runs: 4, lastRunAt: Date.now() - 86400000 * 3, lastAccuracy: 1, daysRecognized: 118 },
  });

  useStore.getState().replaceAll({
    profile: { ...defaultProfile(), locale, name: 'Mario Rossi', employer: 'Gastronomia Lugano SA', employeeId: '10482', department: 'Banco gastronomia', weeklyHours: 42, onboarded: true },
    types: typeMap,
    entries,
    scripts: { [script.id]: script },
    pay: legacyScattaTurniProfile(locale),
    payslips: [],
    imports: [],
    ai: { mode: 'cloud', apiKey: '', model: '', usage: { requests: 2, scriptsCreated: 1, localImports: 4, aiImports: 1, lastAt: Date.now() } },
  });
}
