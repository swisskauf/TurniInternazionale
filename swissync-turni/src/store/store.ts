import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { del, get, set } from 'idb-keyval';
import { uid } from '@/lib/id';
import { emptyPayProfile, starterTypes } from '@/engine/presets';
import { normalizeCode } from '@/engine/recognition/tokens';
import type {
  AiSettings, ImportLog, ISODate, PayProfile, PayslipRecord, Profile, RecognitionScript, ShiftEntry, ShiftType, Locale,
} from '@/engine/types';

const memory = new Map<string, string>();
const idbStorage: StateStorage = {
  getItem: async (name) => {
    try {
      return (await get<string>(name)) ?? localStorage.getItem(name);
    } catch {
      try {
        return localStorage.getItem(name);
      } catch {
        return memory.get(name) ?? null;
      }
    }
  },
  setItem: async (name, value) => {
    try {
      await set(name, value);
    } catch {
      try {
        localStorage.setItem(name, value);
      } catch {
        memory.set(name, value);
      }
    }
  },
  removeItem: async (name) => {
    try {
      await del(name);
      localStorage.removeItem(name);
    } catch {
      memory.delete(name);
    }
  },
};

function detectLocale(): Locale {
  const l = (typeof navigator !== 'undefined' ? navigator.language : 'it').slice(0, 2);
  return (['it', 'en', 'de', 'fr'] as const).includes(l as Locale) ? (l as Locale) : 'it';
}

export function defaultProfile(): Profile {
  return {
    name: '',
    employer: '',
    employeeId: '',
    department: '',
    locale: detectLocale(),
    country: 'CH',
    region: 'TI',
    theme: 'system',
    hoursFormat: 'decimal',
    weeklyHours: 0,
    workDaysPerWeek: 5,
    customHolidays: [],
    ignoredHolidays: [],
    clockEnabled: true,
    reminders: { enabled: false, minutesBefore: 60 },
    onboarded: false,
  };
}

const defaultAi = (): AiSettings => ({
  mode: 'cloud',
  apiKey: '',
  model: '',
  usage: { requests: 0, scriptsCreated: 0, localImports: 0, aiImports: 0, lastAt: 0 },
});

export interface ImportDay {
  date: ISODate;
  code: string;
  typeId?: string;
  segments?: ShiftEntry['segments'];
  kind?: ShiftEntry['kind'];
}

export interface ApplyResult {
  added: number;
  changed: number;
  unchanged: number;
  keptManual: number;
}

interface UndoSnapshot {
  label: string;
  entries: Record<ISODate, ShiftEntry>;
  at: number;
}

export interface AppState {
  hydrated: boolean;
  profile: Profile;
  types: Record<string, ShiftType>;
  entries: Record<ISODate, ShiftEntry>;
  scripts: Record<string, RecognitionScript>;
  pay: PayProfile;
  payslips: PayslipRecord[];
  imports: ImportLog[];
  ai: AiSettings;
  undo: UndoSnapshot[];

  setProfile: (p: Partial<Profile>) => void;
  upsertType: (t: ShiftType) => void;
  removeType: (id: string) => void;
  setEntry: (date: ISODate, entry: ShiftEntry | null) => void;
  setEntries: (map: Record<ISODate, ShiftEntry | null>, undoLabel?: string) => void;
  applyImport: (days: ImportDay[], opts: { overwriteManual: boolean; origin: 'import' | 'ai'; log: Omit<ImportLog, 'id' | 'at' | 'added' | 'changed' | 'days'> }) => ApplyResult;
  upsertScript: (s: RecognitionScript) => void;
  removeScript: (id: string) => void;
  recordScriptRun: (id: string, days: number, accuracy: number) => void;
  setPay: (p: PayProfile) => void;
  addPayslip: (p: PayslipRecord) => void;
  removePayslip: (id: string) => void;
  setAi: (p: Partial<AiSettings>) => void;
  bumpAi: (k: keyof AiSettings['usage']) => void;
  pushUndo: (label: string) => void;
  undoLast: () => string | null;
  replaceAll: (data: BackupData) => void;
  resetAll: () => void;
}

export type BackupData = Pick<AppState, 'profile' | 'types' | 'entries' | 'scripts' | 'pay' | 'payslips' | 'imports' | 'ai'>;

function linkEntriesToType(entries: Record<ISODate, ShiftEntry>, t: ShiftType): Record<ISODate, ShiftEntry> | null {
  const keys = new Set([t.code, ...t.aliases].map(normalizeCode).filter(Boolean));
  let changed = false;
  const next = { ...entries };
  for (const [d, e] of Object.entries(entries)) {
    if (!e.typeId && keys.has(normalizeCode(e.code)) && !e.segments?.length) {
      next[d] = { ...e, typeId: t.id, code: t.code };
      changed = true;
    }
  }
  return changed ? next : null;
}

const sameSegments = (a?: ShiftEntry['segments'], b?: ShiftEntry['segments']) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

export const useStore = create<AppState>()(
  persist(
    (setState, getState) => ({
      hydrated: false,
      profile: defaultProfile(),
      types: {},
      entries: {},
      scripts: {},
      pay: emptyPayProfile(),
      payslips: [],
      imports: [],
      ai: defaultAi(),
      undo: [],

      setProfile: (p) => setState((s) => ({ profile: { ...s.profile, ...p } })),

      upsertType: (t) =>
        setState((s) => {
          const types = { ...s.types, [t.id]: { ...t, updatedAt: Date.now() } };
          const linked = linkEntriesToType(s.entries, t);
          return linked ? { types, entries: linked } : { types };
        }),

      removeType: (id) =>
        setState((s) => {
          const used = Object.values(s.entries).some((e) => e.typeId === id);
          const types = { ...s.types };
          if (used) types[id] = { ...types[id], archived: true, updatedAt: Date.now() };
          else delete types[id];
          return { types };
        }),

      setEntry: (date, entry) =>
        setState((s) => {
          const entries = { ...s.entries };
          if (entry) entries[date] = { ...entry, updatedAt: Date.now() };
          else delete entries[date];
          return { entries };
        }),

      setEntries: (map, undoLabel) => {
        if (undoLabel) getState().pushUndo(undoLabel);
        setState((s) => {
          const entries = { ...s.entries };
          const now = Date.now();
          for (const [d, e] of Object.entries(map)) {
            if (e) entries[d] = { ...e, updatedAt: now };
            else delete entries[d];
          }
          return { entries };
        });
      },

      applyImport: (days, { overwriteManual, origin, log }) => {
        const state = getState();
        state.pushUndo(log.fileName);
        const entries = { ...state.entries };
        const importId = uid('imp_');
        const now = Date.now();
        const res: ApplyResult = { added: 0, changed: 0, unchanged: 0, keptManual: 0 };
        for (const d of days) {
          const prev = entries[d.date];
          if (prev?.manual && !overwriteManual) {
            res.keptManual++;
            continue;
          }
          const same = prev && prev.code === d.code && prev.typeId === d.typeId && sameSegments(prev.segments, d.segments) && prev.kind === d.kind;
          if (same) {
            res.unchanged++;
            continue;
          }
          entries[d.date] = {
            date: d.date,
            code: d.code,
            typeId: d.typeId,
            segments: d.segments?.length ? d.segments : undefined,
            kind: d.typeId ? undefined : d.kind,
            note: prev?.note,
            origin,
            importId,
            changedFrom: prev && prev.code !== d.code ? prev.code || '—' : undefined,
            updatedAt: now,
          };
          if (prev) res.changed++;
          else res.added++;
        }
        const entry: ImportLog = { ...log, id: importId, at: now, days: days.length, added: res.added, changed: res.changed };
        setState({ entries, imports: [entry, ...state.imports].slice(0, 50) });
        return res;
      },

      upsertScript: (sc) => setState((s) => ({ scripts: { ...s.scripts, [sc.id]: { ...sc, updatedAt: Date.now() } } })),
      removeScript: (id) =>
        setState((s) => {
          const scripts = { ...s.scripts };
          delete scripts[id];
          return { scripts };
        }),
      recordScriptRun: (id, days, accuracy) =>
        setState((s) => {
          const sc = s.scripts[id];
          if (!sc) return {};
          return {
            scripts: {
              ...s.scripts,
              [id]: { ...sc, stats: { runs: sc.stats.runs + 1, lastRunAt: Date.now(), lastAccuracy: accuracy, daysRecognized: sc.stats.daysRecognized + days } },
            },
          };
        }),

      setPay: (p) => setState({ pay: { ...p, updatedAt: Date.now() } }),
      addPayslip: (p) => setState((s) => ({ payslips: [p, ...s.payslips.filter((x) => x.period !== p.period)].slice(0, 36) })),
      removePayslip: (id) => setState((s) => ({ payslips: s.payslips.filter((p) => p.id !== id) })),

      setAi: (p) => setState((s) => ({ ai: { ...s.ai, ...p } })),
      bumpAi: (k) => setState((s) => ({ ai: { ...s.ai, usage: { ...s.ai.usage, [k]: (s.ai.usage[k] as number) + 1, lastAt: k === 'requests' ? Date.now() : s.ai.usage.lastAt } } })),

      pushUndo: (label) => setState((s) => ({ undo: [...s.undo, { label, entries: s.entries, at: Date.now() }].slice(-10) })),
      undoLast: () => {
        const s = getState();
        const last = s.undo[s.undo.length - 1];
        if (!last) return null;
        setState({ entries: last.entries, undo: s.undo.slice(0, -1) });
        return last.label;
      },

      replaceAll: (data) =>
        setState({
          profile: { ...defaultProfile(), ...data.profile },
          types: data.types ?? {},
          entries: data.entries ?? {},
          scripts: data.scripts ?? {},
          pay: { ...emptyPayProfile(), ...data.pay },
          payslips: data.payslips ?? [],
          imports: data.imports ?? [],
          ai: { ...defaultAi(), ...data.ai },
          undo: [],
        }),

      resetAll: () =>
        setState({
          profile: defaultProfile(),
          types: {},
          entries: {},
          scripts: {},
          pay: emptyPayProfile(),
          payslips: [],
          imports: [],
          ai: defaultAi(),
          undo: [],
        }),
    }),
    {
      name: 'swissync-turni',
      version: 1,
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({
        profile: s.profile,
        types: s.types,
        entries: s.entries,
        scripts: s.scripts,
        pay: s.pay,
        payslips: s.payslips,
        imports: s.imports,
        ai: s.ai,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        return {
          ...current,
          ...p,
          profile: { ...current.profile, ...p.profile },
          pay: { ...current.pay, ...p.pay, supplements: { ...current.pay.supplements, ...p.pay?.supplements }, allowances: { ...current.pay.allowances, ...p.pay?.allowances } },
          ai: { ...current.ai, ...p.ai, usage: { ...current.ai.usage, ...p.ai?.usage } },
        };
      },
      onRehydrateStorage: () => () => {
        useStore.setState({ hydrated: true });
      },
    },
  ),
);

/** Seeds the starter shift types the first time the user finishes onboarding. */
export function ensureStarterTypes(locale: Locale) {
  const s = useStore.getState();
  if (Object.keys(s.types).length) return;
  const types: Record<string, ShiftType> = {};
  for (const t of starterTypes(locale)) types[t.id] = t;
  useStore.setState({ types });
}

export const activeTypes = (types: Record<string, ShiftType>) =>
  Object.values(types).filter((t) => !t.archived).sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind) || a.code.localeCompare(b.code, undefined, { numeric: true }));

const ORDER = ['work', 'training', 'rest', 'vacation', 'holiday', 'sick', 'other'];
const kindOrder = (k: string) => ORDER.indexOf(k);
