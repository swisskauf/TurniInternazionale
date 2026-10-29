import { useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle, Camera, CheckCircle2, ClipboardPaste, Cpu, FileSpreadsheet, FileText, Image as ImageIcon,
  RotateCw, ScanText, ShieldCheck, Sparkles, Wand2, Wrench, X,
} from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, PageHeader, SectionTitle } from '@/components/ui/Card';
import { Checkbox, Field, Input, Select, Switch, Textarea } from '@/components/ui/Form';
import { Sheet } from '@/components/ui/Sheet';
import { Badge, ProgressBar, Spinner, toast } from '@/components/ui/Feedback';
import { ShiftChip } from '@/components/ShiftChip';
import { TypePicker } from '@/features/calendar/TypePicker';
import { TypeEditor, blankType } from '@/features/types/TypeEditor';
import { ScriptEditor } from '@/features/scripts/ScriptEditor';
import { navigate, useRoute } from '@/app/router';
import { AiError } from '@/ai/client';
import { analyzePlanWithAi, compareDays, legendToTypes, refineScriptWithAi, type AnalyzePlanResult } from '@/ai/tasks';
import { readFile, readImage, readSheet, readText, sourceKindOf, type ReadStage } from '@/import/readers';
import { extractKeywords, recognize, type RecognitionResult } from '@/engine/recognition/run';
import { newScript, SYSTEM_SCRIPTS } from '@/engine/recognition/scripts';
import { normalizeCode, type PlanDocument } from '@/engine/recognition/tokens';
import { fmtSegments } from '@/engine/time';
import type { RecognitionScript, ShiftType } from '@/engine/types';
import { uid } from '@/lib/id';
import { useStore } from '@/store/store';
import { useT } from '@/i18n';
import { useFmt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { ReviewList, reviewStatus, type ReviewDay } from './ReviewList';

type Phase = 'pick' | 'reading' | 'nomatch' | 'ai' | 'review';

interface Chosen {
  script: RecognitionScript;
  result: RecognitionResult;
  viaAi: boolean;
  ai?: AnalyzePlanResult;
}

function relink(days: ReviewDay[], types: Record<string, ShiftType>): ReviewDay[] {
  const list = Object.values(types).filter((t) => !t.archived);
  return days.map((d) => {
    if (d.typeId && types[d.typeId]) return d;
    if (d.status !== 'unknown' && d.status !== 'fuzzy') return d;
    const k = normalizeCode(d.code);
    const ty = list.find((t) => [t.code, ...t.aliases].some((a) => normalizeCode(a) === k));
    return ty ? { ...d, typeId: ty.id, code: ty.code, kind: undefined, status: 'ok', confidence: 1 } : d;
  });
}

export function ImportPage() {
  const t = useT();
  const f = useFmt();
  const { params } = useRoute();
  const profile = useStore((s) => s.profile);
  const types = useStore((s) => s.types);
  const entries = useStore((s) => s.entries);
  const userScripts = useStore((s) => s.scripts);
  const imports = useStore((s) => s.imports);
  const ai = useStore((s) => s.ai);
  const applyImport = useStore((s) => s.applyImport);
  const upsertScript = useStore((s) => s.upsertScript);
  const upsertType = useStore((s) => s.upsertType);
  const recordScriptRun = useStore((s) => s.recordScriptRun);
  const bumpAi = useStore((s) => s.bumpAi);
  const undoLast = useStore((s) => s.undoLast);

  const [phase, setPhase] = useState<Phase>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [doc, setDoc] = useState<PlanDocument | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [rotation, setRotation] = useState(0);
  const [progress, setProgress] = useState<{ stage: ReadStage | 'recognize'; value: number }>({ stage: 'loading', value: 0 });
  const [person, setPerson] = useState(profile.name);
  const [period, setPeriod] = useState('');
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [review, setReview] = useState<ReviewDay[]>([]);
  const [overwriteManual, setOverwriteManual] = useState(false);
  const [saveScript, setSaveScript] = useState(true);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [editing, setEditing] = useState<ReviewDay | null>(null);
  const [defining, setDefining] = useState<ShiftType | null>(null);
  const [scriptDraft, setScriptDraft] = useState<RecognitionScript | null>(null);
  const [legendPick, setLegendPick] = useState<Set<string>>(new Set());
  const [refining, setRefining] = useState(false);
  const [error, setError] = useState('');
  const inputs = { camera: useRef<HTMLInputElement>(null), image: useRef<HTMLInputElement>(null), pdf: useRef<HTMLInputElement>(null), sheet: useRef<HTMLInputElement>(null) };

  const periodHint = period ? { year: Number(period.slice(0, 4)), month: Number(period.slice(5, 7)) } : undefined;
  const allScripts = useMemo(() => [...Object.values(userScripts), ...SYSTEM_SCRIPTS], [userScripts]);

  const runRecognition = (d: PlanDocument, who = person, scriptsOverride?: RecognitionScript[]) => {
    setProgress({ stage: 'recognize', value: 1 });
    const res = recognize(d, scriptsOverride ?? allScripts, { person: who, types: Object.values(useStore.getState().types), period: periodHint });
    const best = res[0];
    const good = best && best.result.days.length >= 3 && best.result.quality >= 0.6;
    if (good) {
      openReview({ script: best.script, result: best.result, viaAi: false });
    } else {
      setChosen(best ? { script: best.script, result: best.result, viaAi: false } : null);
      setPhase('nomatch');
    }
  };

  const openReview = (c: Chosen, days = c.result.days) => {
    setChosen(c);
    setReview(relink(days.map((d) => ({ ...d, include: d.status !== 'empty' || !!d.kind })), useStore.getState().types));
    setSaveScript(c.viaAi ? c.script.createdBy === 'ai' : c.script.createdBy === 'system');
    setLegendPick(new Set((c.ai?.legend ?? []).filter((l) => !Object.values(useStore.getState().types).some((x) => normalizeCode(x.code) === normalizeCode(l.code))).map((l) => l.code)));
    setPhase('review');
  };

  const load = async (fileOrText: File | string, rot = 0, sheet?: string) => {
    setError('');
    setPhase('reading');
    setProgress({ stage: 'loading', value: 0 });
    try {
      let d: PlanDocument;
      if (typeof fileOrText === 'string') {
        d = readText(fileOrText, 'testo');
        setFile(null);
      } else {
        setFile(fileOrText);
        const kind = sourceKindOf(fileOrText);
        if (!kind) throw new Error('unsupported_file');
        const onProgress = (stage: ReadStage, value: number) => setProgress({ stage, value });
        if (kind === 'image' && rot) d = await readImage(fileOrText, profile.locale, onProgress, rot);
        else if (kind === 'sheet') {
          const s = await readSheet(fileOrText, onProgress, sheet);
          setSheets(s.sheets);
          d = s;
        } else d = await readFile(fileOrText, profile.locale, onProgress);
      }
      setDoc(d);
      runRecognition(d);
    } catch (e) {
      setError((e as Error).message === 'unsupported_file' ? t.import.unsupported : t.common.error);
      setPhase('pick');
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f0 = e.target.files?.[0];
    e.target.value = '';
    if (f0) {
      setRotation(0);
      load(f0);
    }
  };

  const withAi = async (oneShot: boolean) => {
    if (!doc) return;
    setError('');
    setPhase('ai');
    try {
      const res = await analyzePlanWithAi(doc, person, periodHint);
      const label = res.ai.personMatched || person;
      const script = { ...res.script, personLabel: res.script.personLabel || label };
      openReview({ script: oneShot ? { ...script, createdBy: 'system' as const, id: 'oneshot' } : script, result: res.local, viaAi: true, ai: res }, res.days);
      if (oneShot) setSaveScript(false);
    } catch (e) {
      const code = e instanceof AiError ? e.code : 'provider_error';
      setError(t.ai.errors[code] ?? t.common.error);
      setPhase(chosen ? 'nomatch' : 'pick');
    }
  };

  const refine = async () => {
    if (!doc || !chosen) return;
    setRefining(true);
    try {
      const { script, notes } = await refineScriptWithAi(chosen.script, doc, review.filter((d) => d.include), chosen.result.days);
      const res = recognize(doc, [script], { person, types: Object.values(types), period: periodHint })[0];
      const accuracy = chosen.ai ? compareDays(review, res?.result.days ?? []) : res?.result.quality ?? 0;
      script.stats.lastAccuracy = accuracy;
      setChosen({ ...chosen, script, result: res?.result ?? chosen.result, ai: chosen.ai ? { ...chosen.ai, accuracy, script } : undefined });
      toast(`${t.import.refined}${notes ? ` · ${notes}` : ''}`);
    } catch (e) {
      toast(t.ai.errors[e instanceof AiError ? e.code : 'provider_error'] ?? t.common.error, 'error');
    } finally {
      setRefining(false);
    }
  };

  const choosePerson = (label: string) => {
    setPerson(label);
    if (doc) runRecognition(doc, label);
  };

  const apply = () => {
    if (!chosen || !doc) return;
    const days = review.filter((d) => d.include).map((d) => ({ date: d.date, code: d.code, typeId: d.typeId, segments: d.segments, kind: d.typeId ? undefined : d.kind }));
    let scriptToRecord: RecognitionScript | null = null;
    if (chosen.viaAi && saveScript && chosen.script.id !== 'oneshot') {
      scriptToRecord = { ...chosen.script, stats: { ...chosen.script.stats, runs: 1, lastRunAt: Date.now(), daysRecognized: days.length } };
      upsertScript(scriptToRecord);
      bumpAi('scriptsCreated');
    } else if (!chosen.viaAi && chosen.script.createdBy === 'system' && saveScript) {
      scriptToRecord = newScript({
        id: uid('scr_'),
        name: extractKeywords(doc, person, 2).map((k) => k[0].toUpperCase() + k.slice(1)).join(' ') || doc.fileName.replace(/\.[a-z0-9]+$/i, ''),
        createdBy: 'local',
        layout: chosen.script.layout,
        header: chosen.script.header,
        keywords: extractKeywords(doc, person),
        personLabel: chosen.result.personLabel ?? '',
        personAliases: person ? [person] : [],
        sampleText: doc.text.slice(0, 24000),
        stats: { runs: 1, lastRunAt: Date.now(), lastAccuracy: chosen.result.quality, daysRecognized: days.length },
      });
      upsertScript(scriptToRecord);
    } else if (!chosen.viaAi && userScripts[chosen.script.id]) {
      recordScriptRun(chosen.script.id, days.length, chosen.result.quality);
    }
    bumpAi(chosen.viaAi ? 'aiImports' : 'localImports');
    const res = applyImport(days, {
      overwriteManual,
      origin: chosen.viaAi ? 'ai' : 'import',
      log: {
        fileName: doc.fileName,
        sourceKind: doc.kind,
        scriptId: scriptToRecord?.id ?? chosen.script.id,
        scriptName: scriptToRecord?.name ?? chosen.script.name,
        usedAi: chosen.viaAi,
        period: review[0]?.date.slice(0, 7) ?? '',
      },
    });
    toast(`${t.import.applied(res.added, res.changed)}${res.keptManual ? ` · ${t.import.keptManual(res.keptManual)}` : ''}`, 'success', { label: t.common.undo, run: () => undoLast() });
    if (person && person !== profile.name && !profile.name) useStore.getState().setProfile({ name: person });
    const month = review.find((d) => d.include)?.date.slice(0, 7);
    reset();
    navigate('/calendar', month ? { month } : undefined);
  };

  const reset = () => {
    setPhase('pick');
    setDoc(null);
    setFile(null);
    setChosen(null);
    setReview([]);
    setError('');
  };

  const newLegend = (chosen?.ai?.legend ?? []).filter((l) => !Object.values(types).some((x) => normalizeCode(x.code) === normalizeCode(l.code)));
  // Codes the AI legend already explains are offered there, not listed twice.
  const legendCodes = new Set(newLegend.map((l) => normalizeCode(l.code)));
  const unknownCodes = [...new Set(review.filter((d) => d.include && d.status === 'unknown').map((d) => d.code))].filter((c) => !legendCodes.has(normalizeCode(c)));
  const included = review.filter((d) => d.include).length;
  const highlight = params.get('source');

  // -------------------------------------------------------------------------
  const stageLabel: Record<string, string> = {
    loading: t.import.reading, 'ocr-init': t.import.ocrInit, ocr: t.import.ocr, pdf: t.import.pdfReading, sheet: t.import.sheetReading, done: t.import.recognizing, recognize: t.import.recognizing,
  };

  const sources = [
    { key: 'camera', icon: <Camera className="size-6" />, label: t.import.camera, hint: t.import.cameraHint, accent: 'brand-gradient text-white', match: 'photo' },
    { key: 'image', icon: <ImageIcon className="size-6" />, label: t.import.image, hint: t.import.imageHint, accent: 'bg-sky-500/12 text-sky-500', match: 'photo' },
    { key: 'pdf', icon: <FileText className="size-6" />, label: t.import.pdf, hint: t.import.pdfHint, accent: 'bg-violet-500/12 text-violet-500', match: 'pdf' },
    { key: 'sheet', icon: <FileSpreadsheet className="size-6" />, label: t.import.sheet, hint: t.import.sheetHint, accent: 'bg-emerald-500/12 text-emerald-500', match: 'excel' },
    { key: 'paste', icon: <ClipboardPaste className="size-6" />, label: t.import.paste, hint: t.import.pasteHint, accent: 'bg-amber-500/12 text-amber-500', match: 'text' },
  ] as const;

  return (
    <div>
      <PageHeader
        title={t.import.title}
        subtitle={phase === 'pick' ? t.import.subtitle : undefined}
        actions={phase !== 'pick' && <IconButton label={t.common.close} variant="secondary" onClick={reset}><X className="size-5" /></IconButton>}
      />

      {/* Hidden inputs */}
      <input ref={inputs.camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      <input ref={inputs.image} type="file" accept="image/*" className="hidden" onChange={onFile} />
      <input ref={inputs.pdf} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onFile} />
      <input ref={inputs.sheet} type="file" accept=".xlsx,.xlsm,.csv,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={onFile} />

      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl bg-danger/10 p-4 text-[14px] text-ink ring-1 ring-danger/25">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" />
          <span>{error}</span>
        </div>
      )}

      {phase === 'pick' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {sources.map((s, i) => (
              <button
                key={s.key}
                onClick={() => (s.key === 'paste' ? setPasteOpen(true) : inputs[s.key].current?.click())}
                className={cn(
                  'group flex flex-col items-start gap-4 rounded-[22px] bg-surface p-4 text-left shadow-card ring-1 ring-line transition hover:-translate-y-0.5 hover:ring-line-strong',
                  i === 0 && 'col-span-2 sm:col-span-1',
                  highlight === s.match && 'ring-2 ring-brand',
                )}
              >
                <span className={cn('flex size-12 items-center justify-center rounded-2xl', s.accent)}>{s.icon}</span>
                <span>
                  <span className="block text-[16px] font-semibold text-ink">{s.label}</span>
                  <span className="block text-[13px] text-muted">{s.hint}</span>
                </span>
              </button>
            ))}
          </div>

          <Card className="mt-4 grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <Field label={t.import.person} hint={t.import.personHint}>
              <Input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Rossi M." />
            </Field>
            <Field label={t.import.period}>
              <MonthSelect value={period} onChange={setPeriod} />
            </Field>
          </Card>

          <div className="mt-4 flex items-start gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-muted ring-1 ring-line">
            <ShieldCheck className="mt-0.5 size-4.5 shrink-0 text-success" />
            {t.import.privacy}
          </div>

          <SectionTitle>{t.import.history}</SectionTitle>
          <Card className="overflow-hidden">
            {imports.length === 0 && <p className="px-5 py-5 text-[14px] text-muted">{t.import.historyEmpty}</p>}
            <div className="divide-y divide-line">
              {imports.slice(0, 8).map((imp) => (
                <div key={imp.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', imp.usedAi ? 'bg-violet-500/12 text-violet-500' : 'bg-success/12 text-success')}>
                    {imp.usedAi ? <Sparkles className="size-4.5" /> : <Cpu className="size-4.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14.5px] font-medium text-ink">{imp.fileName}</div>
                    <div className="truncate text-[12.5px] text-muted">{new Date(imp.at).toLocaleDateString(profile.locale)} · {imp.scriptName} · {t.import.applied(imp.added, imp.changed)}</div>
                  </div>
                  {!imp.usedAi && <Badge tone="success">{t.import.noAiUsed}</Badge>}
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      )}

      {(phase === 'reading' || phase === 'ai') && (
        <Card className="flex flex-col items-center px-6 py-14 text-center">
          <div className="relative mb-6">
            {doc?.images[0] || (file && file.type.startsWith('image/')) ? (
              <div className="relative size-36 overflow-hidden rounded-3xl ring-1 ring-line">
                <img src={doc?.images[0] ?? (file ? URL.createObjectURL(file) : '')} alt="" className="size-full object-cover opacity-80" />
                <motion.div className="absolute inset-x-0 h-10 bg-gradient-to-b from-transparent via-brand/40 to-transparent" animate={{ y: [-40, 150] }} transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }} />
              </div>
            ) : (
              <span className={cn('flex size-20 items-center justify-center rounded-3xl', phase === 'ai' ? 'bg-violet-500/12 text-violet-500' : 'bg-brand-soft text-brand')}>
                {phase === 'ai' ? <Sparkles className="size-9" /> : <ScanText className="size-9" />}
              </span>
            )}
          </div>
          <h3 className="text-[18px] font-semibold text-ink">{phase === 'ai' ? t.ai.working : stageLabel[progress.stage]}</h3>
          <p className="mt-1.5 text-[14px] text-muted">{phase === 'ai' ? t.ai.workingHint : t.import.privacy}</p>
          {phase === 'reading' && <ProgressBar value={progress.stage === 'ocr' || progress.stage === 'pdf' ? progress.value : progress.stage === 'recognize' ? 1 : 0.15} className="mt-6 w-56" />}
          {phase === 'ai' && <Spinner className="mt-6 size-6 text-violet-500" />}
        </Card>
      )}

      {phase === 'nomatch' && doc && (
        <div className="space-y-4">
          {chosen?.result.issues.includes('choose-person') || (chosen?.result.issues.includes('no-person') && chosen.result.people.length) ? (
            <Card className="p-5">
              <h3 className="text-[17px] font-semibold text-ink">{t.import.choosePerson}</h3>
              <p className="mt-1 text-[14px] text-muted">{t.import.choosePersonHint}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {chosen.result.people.map((p) => (
                  <button key={p} onClick={() => choosePerson(p)} className="rounded-full bg-surface-2 px-3.5 py-2 text-[14px] font-semibold text-ink ring-1 ring-line transition hover:bg-brand-soft hover:text-brand hover:ring-brand/30">
                    {p}
                  </button>
                ))}
              </div>
            </Card>
          ) : null}

          <Card className="overflow-hidden">
            <div className="hero-gradient p-5 text-white sm:p-6">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-white/60"><Wand2 className="size-4" /> {t.nav.scripts}</div>
              <h3 className="mt-2 text-[20px] font-bold tracking-[-0.02em]">{t.import.noMatchTitle}</h3>
              <p className="mt-1.5 max-w-xl text-[14.5px] leading-relaxed text-white/70">{t.import.noMatchText}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5">
              <button disabled={ai.mode === 'off'} onClick={() => withAi(false)} className="flex items-start gap-3.5 rounded-2xl bg-violet-500/8 p-4 text-left ring-1 ring-violet-500/25 transition hover:bg-violet-500/12 disabled:opacity-50">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500 text-white"><Sparkles className="size-5" /></span>
                <span>
                  <span className="flex items-center gap-2 text-[15.5px] font-semibold text-ink">{t.import.createWithAi} <Badge tone="brand">{t.common.recommended}</Badge></span>
                  <span className="mt-0.5 block text-[13px] text-muted">{t.import.createWithAiHint}</span>
                </span>
              </button>
              <button onClick={() => setScriptDraft(newScript({ id: uid('scr_'), name: doc.fileName.replace(/\.[a-z0-9]+$/i, ''), createdBy: 'manual', keywords: extractKeywords(doc, person), personLabel: chosen?.result.personLabel ?? '', personAliases: person ? [person] : [] }))} className="flex items-start gap-3.5 rounded-2xl bg-surface-2 p-4 text-left ring-1 ring-line transition hover:bg-surface-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-ink text-bg"><Wrench className="size-5" /></span>
                <span>
                  <span className="block text-[15.5px] font-semibold text-ink">{t.import.createManual}</span>
                  <span className="mt-0.5 block text-[13px] text-muted">{t.import.createManualHint}</span>
                </span>
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 sm:px-5">
              {ai.mode !== 'off' && <Button size="sm" variant="ghost" icon={<Sparkles className="size-4" />} onClick={() => withAi(true)}>{t.import.oneShotAi}</Button>}
              {chosen && chosen.result.days.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => openReview(chosen)}>{t.import.reviewTitle} ({chosen.result.days.length})</Button>
              )}
              {file?.type.startsWith('image/') && (
                <Button size="sm" variant="ghost" icon={<RotateCw className="size-4" />} onClick={() => { const r = (rotation + 90) % 360; setRotation(r); load(file, r); }}>{t.import.rotate}</Button>
              )}
              {sheets.length > 1 && file && (
                <div className="ml-auto w-48">
                  <Select onChange={(e) => load(file, 0, e.target.value)} defaultValue="">
                    <option value="" disabled>{t.import.sheetPick}</option>
                    {sheets.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </div>
              )}
            </div>
          </Card>

          <Card className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <Field label={t.import.person}>
              <div className="flex gap-2">
                <Input value={person} onChange={(e) => setPerson(e.target.value)} />
                <Button onClick={() => runRecognition(doc)}>{t.common.retry}</Button>
              </div>
            </Field>
            <Field label={t.import.period}>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1"><MonthSelect value={period} onChange={setPeriod} /></div>
                <Button onClick={() => runRecognition(doc)}>{t.common.retry}</Button>
              </div>
            </Field>
          </Card>
        </div>
      )}

      {phase === 'review' && chosen && doc && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
          <div className="min-w-0 space-y-4">
            <Card className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                {chosen.viaAi ? <Badge tone="brand"><Sparkles className="size-3" /> {t.import.aiUsed}</Badge> : <Badge tone="success"><Cpu className="size-3" /> {t.import.noAiUsed}</Badge>}
                {!chosen.viaAi && <Badge>{t.import.usedScript(chosen.script.name)}</Badge>}
                {!chosen.viaAi && <Badge tone={chosen.result.quality >= 0.85 ? 'success' : 'warning'}>{t.import.quality(Math.round(chosen.result.quality * 100))}</Badge>}
                {chosen.result.personLabel && <Badge tone="info">{chosen.result.personLabel}</Badge>}
              </div>
              <h3 className="mt-3 text-[18px] font-semibold text-ink">{t.import.reviewTitle}</h3>
              <p className="text-[13.5px] text-muted">{t.import.reviewHint}</p>
              {chosen.ai?.ai.notes && <p className="mt-3 rounded-xl bg-violet-500/8 px-3 py-2 text-[13px] text-ink-2 ring-1 ring-violet-500/20"><b>{t.import.aiNotes}:</b> {chosen.ai.ai.notes}</p>}
            </Card>

            {unknownCodes.length > 0 && (
              <Card className="p-4 ring-warning/30 sm:p-5">
                <div className="flex items-center gap-2 text-[15px] font-semibold text-ink"><AlertTriangle className="size-4.5 text-warning" /> {t.import.unknownCodes(unknownCodes.length)}</div>
                <p className="mt-1 text-[13px] text-muted">{t.import.unknownCodesHint}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {unknownCodes.map((c) => (
                    <button key={c} onClick={() => setDefining(blankType(c))} className="flex items-center gap-2 rounded-xl bg-surface-2 py-1.5 pl-1.5 pr-3 ring-1 ring-line transition hover:bg-surface-3">
                      <ShiftChip code={c} unknown />
                      <span className="text-[13px] font-semibold text-brand">{t.day.defineCode}</span>
                    </button>
                  ))}
                </div>
              </Card>
            )}

            {newLegend.length > 0 && (
              <Card className="p-4 sm:p-5">
                <div className="flex items-center gap-2 text-[15px] font-semibold text-ink"><Sparkles className="size-4.5 text-violet-500" /> {t.types.proposals}</div>
                <div className="mt-3 space-y-2">
                  {newLegend.map((l) => (
                    <label key={l.code} className="flex cursor-pointer items-center gap-3 rounded-xl bg-surface-2 px-3 py-2 ring-1 ring-line">
                      <input type="checkbox" className="size-4.5 accent-[var(--brand)]" checked={legendPick.has(l.code)} onChange={() => setLegendPick((s) => { const n = new Set(s); if (n.has(l.code)) n.delete(l.code); else n.add(l.code); return n; })} />
                      <ShiftChip code={l.code} kind={l.kind} />
                      <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{l.name}</span>
                      <span className="tabular text-[12.5px] text-muted">{l.segments.length ? fmtSegments(l.segments) : t.kinds[l.kind]}</span>
                    </label>
                  ))}
                </div>
                <Button className="mt-3" size="sm" variant="soft" disabled={!legendPick.size} onClick={() => {
                  const created = legendToTypes(newLegend.filter((l) => legendPick.has(l.code)));
                  created.forEach(upsertType);
                  const map = { ...useStore.getState().types };
                  setReview((r) => relink(r, map));
                  setLegendPick(new Set());
                  toast(t.toast.saved);
                }}>
                  {t.import.defineFromLegend(legendPick.size)}
                </Button>
              </Card>
            )}

            <Card className="overflow-hidden">
              <ReviewList
                days={review}
                types={types}
                entries={entries}
                onTap={(d) => setEditing(d)}
                onToggle={(d) => setReview((r) => r.map((x) => (x.date === d.date ? { ...x, include: !x.include } : x)))}
              />
            </Card>
          </div>

          <div className="space-y-4 xl:sticky xl:top-8 xl:self-start">
            {doc.images[0] && (
              <Card className="overflow-hidden">
                <img src={doc.images[0]} alt="" className="max-h-64 w-full object-cover object-top" />
              </Card>
            )}
            <Card className="space-y-4 p-4 sm:p-5">
              <div className="grid grid-cols-3 gap-2 text-center">
                {(['new', 'changed', 'manual'] as const).map((k) => (
                  <div key={k} className="rounded-2xl bg-surface-2 py-2.5 ring-1 ring-line">
                    <div className="tabular text-[20px] font-bold text-ink">{review.filter((d) => d.include && reviewStatus(d, entries[d.date]) === k).length}</div>
                    <div className="text-[11.5px] font-medium text-muted">{k === 'new' ? t.import.statusNew : k === 'changed' ? t.import.statusChanged : t.import.statusManual}</div>
                  </div>
                ))}
              </div>
              {chosen.ai && (
                <div className={cn('rounded-2xl p-3 text-[13px] ring-1', chosen.ai.accuracy >= 0.8 ? 'bg-success/8 text-ink-2 ring-success/25' : 'bg-warning/10 text-ink-2 ring-warning/25')}>
                  <div className="flex items-center gap-2 font-semibold text-ink">
                    {chosen.ai.accuracy >= 0.8 ? <CheckCircle2 className="size-4 text-success" /> : <AlertTriangle className="size-4 text-warning" />}
                    {t.import.aiAccuracy(Math.round(chosen.ai.accuracy * 100))}
                  </div>
                  {chosen.ai.accuracy < 0.8 && <p className="mt-1">{t.import.aiAccuracyLow}</p>}
                  {chosen.ai.accuracy < 0.95 && chosen.script.id !== 'oneshot' && (
                    <Button className="mt-2" size="sm" variant="secondary" loading={refining} icon={<Sparkles className="size-4" />} onClick={refine}>{t.import.refine}</Button>
                  )}
                </div>
              )}
              {(chosen.viaAi ? chosen.script.id !== 'oneshot' : chosen.script.createdBy === 'system') && (
                <Switch checked={saveScript} onChange={setSaveScript} label={t.import.saveScript} hint={t.import.saveScriptHint} />
              )}
              <Switch checked={overwriteManual} onChange={setOverwriteManual} label={t.import.overwriteManual} />
              <Button variant="primary" size="lg" block disabled={!included} onClick={apply}>{t.import.apply(included)}</Button>
            </Card>
          </div>
        </div>
      )}

      {phase === 'review' && included > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+92px)] z-30 flex justify-center px-4 lg:bottom-6 lg:pl-[264px] xl:hidden">
          <Button variant="primary" size="lg" className="pointer-events-auto shadow-float" onClick={apply}>{t.import.apply(included)}</Button>
        </div>
      )}

      {/* Paste text */}
      <Sheet open={pasteOpen} onClose={() => setPasteOpen(false)} title={t.import.paste} subtitle={t.import.pasteHint} closeLabel={t.common.close}
        footer={<Button variant="primary" block disabled={!pasteText.trim()} onClick={() => { setPasteOpen(false); load(pasteText); }}>{t.common.continue}</Button>}>
        <Textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={t.import.pastePlaceholder} className="min-h-56 font-mono text-[13.5px]" autoFocus />
      </Sheet>

      {/* Reassign one day */}
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? f.dateCap(editing.date, 'EEEE d MMMM') : ''} subtitle={editing?.raw ? `“${editing.raw}”` : undefined} closeLabel={t.common.close}>
        {editing && (
          <>
            <TypePicker
              selectedId={editing.typeId}
              onPick={(ty) => {
                setReview((r) => r.map((x) => (x.date === editing.date ? (ty ? { ...x, typeId: ty.id, code: ty.code, kind: undefined, segments: undefined, status: 'ok', include: true } : { ...x, include: false }) : x)));
                setEditing(null);
              }}
              allowNone
            />
            <Checkbox className="mt-4" checked={editing.include} label={t.common.select} onChange={(v) => { setReview((r) => r.map((x) => (x.date === editing.date ? { ...x, include: v } : x))); setEditing({ ...editing, include: v }); }} />
          </>
        )}
      </Sheet>

      {defining && (
        <TypeEditor open={!!defining} type={defining} onClose={() => setDefining(null)} onSaved={(ty) => setReview((r) => relink(r, { ...useStore.getState().types, [ty.id]: ty }))} />
      )}
      {scriptDraft && (
        <ScriptEditor open={!!scriptDraft} script={scriptDraft} sample={doc} onClose={() => setScriptDraft(null)} onSaved={(s) => doc && runRecognition(doc, person, [s, ...allScripts.filter((x) => x.id !== s.id)])} />
      )}
    </div>
  );
}

/** "Detect automatically" or one of the months around today. */
function MonthSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT();
  const f = useFmt();
  const now = new Date();
  const months = Array.from({ length: 8 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 3 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t.import.periodAuto}</option>
      {months.map((m) => <option key={m} value={m}>{f.dateCap(`${m}-01`, 'LLLL yyyy')}</option>)}
    </Select>
  );
}
