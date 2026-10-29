import type { HM, HoursFormat, Segment } from './types';

/**
 * Parses a clock time written in the many ways plans use:
 * `8`, `08`, `8:30`, `08.30`, `0830`, `8h30`, `24:00`. Returns minutes from midnight or null.
 */
export function parseHM(input: string | undefined | null): number | null {
  if (input == null) return null;
  const s = String(input).trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  let h: number;
  let m = 0;
  let match = s.match(/^(\d{1,2})[:.h,](\d{2})$/);
  if (match) {
    h = Number(match[1]);
    m = Number(match[2]);
  } else if ((match = s.match(/^(\d{1,2})h?$/))) {
    h = Number(match[1]);
  } else if ((match = s.match(/^(\d{2})(\d{2})$/))) {
    h = Number(match[1]);
    m = Number(match[2]);
  } else {
    return null;
  }
  if (h > 24 || m > 59 || (h === 24 && m > 0)) return null;
  return h * 60 + m;
}

export function fmtHM(minutes: number): HM {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Normalizes a user-entered time to `HH:mm`, or returns '' if invalid. */
export function normalizeHM(input: string): HM {
  const v = parseHM(input);
  if (v == null) return '';
  return v === 1440 ? '24:00' : fmtHM(v);
}

/** Duration of a segment in minutes; end <= start means it ends the next day. */
export function segmentMinutes(seg: Segment): number {
  const s = parseHM(seg.start);
  const e = parseHM(seg.end);
  if (s == null || e == null) return 0;
  if (e === s) return 0;
  return e > s ? e - s : e + 1440 - s;
}

export function isValidSegment(seg: Segment): boolean {
  return parseHM(seg.start) != null && parseHM(seg.end) != null && segmentMinutes(seg) > 0;
}

/**
 * Converts segments to absolute minute intervals from the start of the shift day,
 * so later segments that run past midnight keep increasing (e.g. 22:00–02:00 → [1320, 1560]).
 */
export function toAbsoluteIntervals(segments: Segment[]): [number, number][] {
  const out: [number, number][] = [];
  let offset = 0;
  let prevEnd = -1;
  for (const seg of segments) {
    const s = parseHM(seg.start);
    const len = segmentMinutes(seg);
    if (s == null || len <= 0) continue;
    let start = s + offset;
    while (start < prevEnd) {
      offset += 1440;
      start += 1440;
    }
    out.push([start, start + len]);
    prevEnd = start + len;
  }
  return out;
}

export function totalSegmentMinutes(segments: Segment[]): number {
  return segments.reduce((sum, seg) => sum + segmentMinutes(seg), 0);
}

/** Gaps between consecutive segments (the implicit breaks), in minutes. */
export function gapMinutes(segments: Segment[]): number {
  const iv = toAbsoluteIntervals(segments);
  let gaps = 0;
  for (let i = 1; i < iv.length; i++) gaps += Math.max(0, iv[i][0] - iv[i - 1][1]);
  return gaps;
}

export function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

export function minutesToHours(min: number): number {
  return min / 60;
}

/** Formats hours either as `7.50` or `7h 30`. */
export function fmtHours(hours: number, format: HoursFormat = 'decimal', opts: { zero?: string; unit?: boolean } = {}): string {
  if (!hours && opts.zero !== undefined) return opts.zero;
  const sign = hours < 0 ? '−' : '';
  const abs = Math.abs(hours);
  if (format === 'hm') {
    const totalMin = Math.round(abs * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${sign}${h}h${m ? ` ${String(m).padStart(2, '0')}` : ''}`;
  }
  return `${sign}${abs.toFixed(2)}${opts.unit ? ' h' : ''}`;
}

export function fmtSegments(segments: Segment[]): string {
  return segments.map((s) => `${s.start}–${s.end}`).join(' · ');
}

/**
 * Finds time ranges inside free text: `08:00-12:00`, `8-12`, `8.30–17`, `0800/1700`.
 * Used by the recognizer and the quick-entry parser.
 */
export function extractTimeRanges(text: string): Segment[] {
  const re = /(?<![\d:.])(\d{1,2}(?:[:.h]\d{2})?|\d{4})\s*(?:-|–|—|\/|à|a|bis|to|>)\s*(\d{1,2}(?:[:.h]\d{2})?|\d{4})(?![\d:.])/gi;
  const out: Segment[] = [];
  for (const m of text.matchAll(re)) {
    const a = parseHM(m[1]);
    const b = parseHM(m[2]);
    if (a == null || b == null || a === b) continue;
    // "1-2" style day ranges are not times: require either minutes or plausible hours.
    const plain = /^\d{1,2}$/.test(m[1]) && /^\d{1,2}$/.test(m[2]);
    if (plain && Number(m[1]) < 4 && Number(m[2]) < 4) continue;
    out.push({ start: fmtHM(a), end: b === 1440 ? '24:00' : fmtHM(b) });
  }
  return out;
}
