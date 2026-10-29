import { addDays, makeISO, toISO, fromISO } from './dates';
import type { Country, ISODate } from './types';

/** Gregorian Easter Sunday (Anonymous / Meeus algorithm). */
export function easterSunday(year: number): ISODate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return makeISO(year, month, day)!;
}

type Rule =
  | { id: string; fixed: [number, number] }
  | { id: string; easter: number }
  | { id: string; calc: (year: number) => ISODate };

/** nth weekday (0=Sun) of a month, e.g. first Sunday of September. */
function nthWeekday(year: number, month: number, weekday: number, n: number): ISODate {
  const first = new Date(year, month - 1, 1);
  const delta = (weekday - first.getDay() + 7) % 7;
  return toISO(new Date(year, month - 1, 1 + delta + (n - 1) * 7));
}

const R = {
  newYear: { id: 'newYear', fixed: [1, 1] },
  berchtold: { id: 'berchtold', fixed: [1, 2] },
  epiphany: { id: 'epiphany', fixed: [1, 6] },
  stJoseph: { id: 'stJoseph', fixed: [3, 19] },
  goodFriday: { id: 'goodFriday', easter: -2 },
  easter: { id: 'easter', easter: 0 },
  easterMonday: { id: 'easterMonday', easter: 1 },
  labour: { id: 'labour', fixed: [5, 1] },
  ascension: { id: 'ascension', easter: 39 },
  whitMonday: { id: 'whitMonday', easter: 50 },
  corpusChristi: { id: 'corpusChristi', easter: 60 },
  stPeterPaul: { id: 'stPeterPaul', fixed: [6, 29] },
  swissNational: { id: 'swissNational', fixed: [8, 1] },
  assumption: { id: 'assumption', fixed: [8, 15] },
  allSaints: { id: 'allSaints', fixed: [11, 1] },
  immaculate: { id: 'immaculate', fixed: [12, 8] },
  christmas: { id: 'christmas', fixed: [12, 25] },
  stStephen: { id: 'stStephen', fixed: [12, 26] },
  restoration: { id: 'restoration', fixed: [12, 31] },
  // Jeûne genevois: Thursday after the first Sunday of September.
  jeuneGenevois: { id: 'jeuneGenevois', calc: (y: number) => addDays(nthWeekday(y, 9, 0, 1), 4) },
  // Lundi du Jeûne fédéral: Monday after the third Sunday of September.
  lundiJeune: { id: 'lundiJeune', calc: (y: number) => addDays(nthWeekday(y, 9, 0, 3), 1) },
  liberation: { id: 'liberation', fixed: [4, 25] },
  republic: { id: 'republic', fixed: [6, 2] },
  stFrancis: { id: 'stFrancis', fixed: [10, 4] },
  germanUnity: { id: 'germanUnity', fixed: [10, 3] },
  victory: { id: 'victory', fixed: [5, 8] },
  bastille: { id: 'bastille', fixed: [7, 14] },
  armistice: { id: 'armistice', fixed: [11, 11] },
  austriaNational: { id: 'austriaNational', fixed: [10, 26] },
} satisfies Record<string, Rule>;

const CH_COMMON: Rule[] = [R.newYear, R.goodFriday, R.easterMonday, R.ascension, R.whitMonday, R.swissNational, R.christmas, R.stStephen];

/** Indicative cantonal calendars. Users can add or remove days in Settings. */
export const CH_CANTONS: Record<string, Rule[]> = {
  TI: [R.newYear, R.epiphany, R.stJoseph, R.easterMonday, R.labour, R.ascension, R.whitMonday, R.corpusChristi, R.stPeterPaul, R.swissNational, R.assumption, R.allSaints, R.immaculate, R.christmas, R.stStephen],
  GR: [R.newYear, R.berchtold, R.goodFriday, R.easterMonday, R.ascension, R.whitMonday, R.swissNational, R.christmas, R.stStephen],
  ZH: [R.newYear, R.berchtold, R.goodFriday, R.easterMonday, R.labour, R.ascension, R.whitMonday, R.swissNational, R.christmas, R.stStephen],
  BE: [R.newYear, R.berchtold, R.goodFriday, R.easterMonday, R.ascension, R.whitMonday, R.swissNational, R.christmas, R.stStephen],
  LU: [R.newYear, R.berchtold, R.goodFriday, R.easterMonday, R.ascension, R.whitMonday, R.corpusChristi, R.swissNational, R.assumption, R.allSaints, R.immaculate, R.christmas, R.stStephen],
  BS: [R.newYear, R.goodFriday, R.easterMonday, R.labour, R.ascension, R.whitMonday, R.swissNational, R.christmas, R.stStephen],
  BL: [R.newYear, R.goodFriday, R.easterMonday, R.labour, R.ascension, R.whitMonday, R.swissNational, R.christmas, R.stStephen],
  AG: [R.newYear, R.berchtold, R.goodFriday, R.easterMonday, R.ascension, R.whitMonday, R.swissNational, R.christmas, R.stStephen],
  SG: [R.newYear, R.goodFriday, R.easterMonday, R.ascension, R.whitMonday, R.swissNational, R.allSaints, R.christmas, R.stStephen],
  GE: [R.newYear, R.goodFriday, R.easterMonday, R.ascension, R.whitMonday, R.swissNational, R.jeuneGenevois, R.christmas, R.restoration],
  VD: [R.newYear, R.berchtold, R.goodFriday, R.easterMonday, R.ascension, R.whitMonday, R.swissNational, R.lundiJeune, R.christmas],
  NE: [R.newYear, R.goodFriday, R.easterMonday, R.ascension, R.whitMonday, R.swissNational, R.lundiJeune, R.christmas],
  FR: [R.newYear, R.goodFriday, R.easterMonday, R.ascension, R.whitMonday, R.corpusChristi, R.swissNational, R.assumption, R.allSaints, R.immaculate, R.christmas],
  VS: [R.newYear, R.stJoseph, R.ascension, R.corpusChristi, R.swissNational, R.assumption, R.allSaints, R.immaculate, R.christmas],
  JU: [R.newYear, R.berchtold, R.goodFriday, R.easterMonday, R.labour, R.ascension, R.whitMonday, R.corpusChristi, R.swissNational, R.assumption, R.allSaints, R.christmas],
  ZG: [R.newYear, R.berchtold, R.goodFriday, R.easterMonday, R.ascension, R.whitMonday, R.corpusChristi, R.swissNational, R.assumption, R.allSaints, R.immaculate, R.christmas, R.stStephen],
  SZ: [R.newYear, R.epiphany, R.stJoseph, R.goodFriday, R.easterMonday, R.ascension, R.whitMonday, R.corpusChristi, R.swissNational, R.assumption, R.allSaints, R.immaculate, R.christmas, R.stStephen],
  SO: [R.newYear, R.berchtold, R.goodFriday, R.easterMonday, R.ascension, R.whitMonday, R.corpusChristi, R.swissNational, R.assumption, R.allSaints, R.christmas, R.stStephen],
  TG: [R.newYear, R.berchtold, R.goodFriday, R.easterMonday, R.labour, R.ascension, R.whitMonday, R.swissNational, R.christmas, R.stStephen],
  SH: [R.newYear, R.berchtold, R.goodFriday, R.easterMonday, R.labour, R.ascension, R.whitMonday, R.swissNational, R.christmas, R.stStephen],
  OTHER: CH_COMMON,
};

export const CH_CANTON_CODES = Object.keys(CH_CANTONS).filter((c) => c !== 'OTHER').sort();

const COUNTRY_RULES: Record<Exclude<Country, 'CH'>, (year: number) => Rule[]> = {
  IT: (y) => [
    R.newYear, R.epiphany, R.easterMonday, R.liberation, R.labour, R.republic, R.assumption,
    ...(y >= 2026 ? [R.stFrancis] : []), R.allSaints, R.immaculate, R.christmas, R.stStephen,
  ],
  DE: () => [R.newYear, R.goodFriday, R.easterMonday, R.labour, R.ascension, R.whitMonday, R.germanUnity, R.christmas, R.stStephen],
  FR: () => [R.newYear, R.easterMonday, R.labour, R.victory, R.ascension, R.whitMonday, R.bastille, R.assumption, R.allSaints, R.armistice, R.christmas],
  AT: () => [R.newYear, R.epiphany, R.easterMonday, R.labour, R.ascension, R.whitMonday, R.corpusChristi, R.assumption, R.austriaNational, R.allSaints, R.immaculate, R.christmas, R.stStephen],
  OTHER: () => [],
};

function resolve(rule: Rule, year: number): ISODate {
  if ('fixed' in rule) return makeISO(year, rule.fixed[0], rule.fixed[1])!;
  if ('easter' in rule) return addDays(easterSunday(year), rule.easter);
  return rule.calc(year);
}

export interface HolidayOptions {
  country: Country;
  region: string;
  customHolidays: { date: ISODate; name: string }[];
  ignoredHolidays: ISODate[];
}

/** Map of date → holiday id (or custom name prefixed with `custom:`) for one year. */
export function holidaysForYear(year: number, opts: HolidayOptions): Map<ISODate, string> {
  const rules = opts.country === 'CH'
    ? CH_CANTONS[opts.region] ?? CH_COMMON
    : COUNTRY_RULES[opts.country]?.(year) ?? [];
  const map = new Map<ISODate, string>();
  for (const rule of rules) {
    // Easter Sunday itself is already a Sunday; it is not listed.
    map.set(resolve(rule, year), rule.id);
  }
  for (const c of opts.customHolidays) {
    if (c.date.startsWith(String(year))) map.set(c.date, `custom:${c.name}`);
  }
  for (const d of opts.ignoredHolidays) map.delete(d);
  return map;
}

const cache = new Map<string, Map<ISODate, string>>();

export function createHolidayLookup(opts: HolidayOptions): (iso: ISODate) => string | undefined {
  const key = JSON.stringify(opts);
  return (iso: ISODate) => {
    const year = fromISO(iso).getFullYear();
    const k = `${key}|${year}`;
    let m = cache.get(k);
    if (!m) {
      m = holidaysForYear(year, opts);
      cache.set(k, m);
      if (cache.size > 64) cache.delete(cache.keys().next().value as string);
    }
    return m.get(iso);
  };
}
