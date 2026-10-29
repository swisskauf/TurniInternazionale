import { addDays } from '@/engine/dates';
import { toAbsoluteIntervals, fmtHM } from '@/engine/time';
import type { DayCalc } from '@/engine/hours';

const esc = (s: string) => s.replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** iCalendar file with one event per worked segment (floating local times). */
export function buildIcs(days: DayCalc[], title: (d: DayCalc) => string): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Swissync//Turni//IT', 'CALSCALE:GREGORIAN'];
  for (const d of days) {
    if (!d.entry || !d.segments.length || (d.kind !== 'work' && d.kind !== 'training')) continue;
    toAbsoluteIntervals(d.segments).forEach(([s, e], i) => {
      const startDate = addDays(d.date, Math.floor(s / 1440)).replace(/-/g, '');
      const endDate = addDays(d.date, Math.floor(e / 1440)).replace(/-/g, '');
      const endStr = `${endDate}T${fmtHM(e % 1440).replace(':', '')}00`;
      lines.push(
        'BEGIN:VEVENT',
        `UID:${d.date}-${i}@turni.swissync`,
        `DTSTAMP:${stamp()}`,
        `DTSTART:${startDate}T${fmtHM(s % 1440).replace(':', '')}00`,
        `DTEND:${endStr}`,
        `SUMMARY:${esc(title(d))}`,
        ...(d.entry?.note ? [`DESCRIPTION:${esc(d.entry.note)}`] : []),
        'END:VEVENT',
      );
    });
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
