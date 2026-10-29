import { useMemo, useState } from 'react';
import { FileUp, Plus, Trash2, X } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, Input, Segmented, Select, Textarea } from '@/components/ui/Form';
import { Sheet } from '@/components/ui/Sheet';
import { Badge, confirmDialog, Spinner, toast } from '@/components/ui/Feedback';
import { ShiftChip } from '@/components/ShiftChip';
import { runScript } from '@/engine/recognition/run';
import { readText } from '@/import/readers';
import type { PlanDocument } from '@/engine/recognition/tokens';
import type { RecognitionScript } from '@/engine/types';
import { useStore } from '@/store/store';
import { useT } from '@/i18n';
import { useFmt } from '@/lib/format';
import { pickFile } from '@/lib/files';
import { readFile } from '@/import/readers';

export function ScriptEditor({ open, script, sample, onClose, onSaved }: { open: boolean; script: RecognitionScript; sample?: PlanDocument | null; onClose: () => void; onSaved?: (s: RecognitionScript) => void }) {
  const t = useT();
  const f = useFmt();
  const profile = useStore((s) => s.profile);
  const types = useStore((s) => s.types);
  const scripts = useStore((s) => s.scripts);
  const upsertScript = useStore((s) => s.upsertScript);
  const removeScript = useStore((s) => s.removeScript);
  const [draft, setDraft] = useState<RecognitionScript>(script);
  const [keywords, setKeywords] = useState(script.keywords.join(', '));
  const [ignore, setIgnore] = useState(script.ignore.join(' '));
  const [doc, setDoc] = useState<PlanDocument | null>(sample ?? (script.sampleText ? readText(script.sampleText, 'sample') : null));
  const [loading, setLoading] = useState(false);
  const isNew = !scripts[script.id];
  const set = (p: Partial<RecognitionScript>) => setDraft((d) => ({ ...d, ...p }));

  const effective: RecognitionScript = useMemo(
    () => ({ ...draft, keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean), ignore: ignore.split(/\s+/).filter(Boolean) }),
    [draft, keywords, ignore],
  );

  const test = useMemo(() => {
    if (!doc) return null;
    try {
      return runScript(doc, effective, { person: profile.name, types: Object.values(types) });
    } catch {
      return null;
    }
  }, [doc, effective, profile.name, types]);

  const loadSample = async () => {
    const file = await pickFile('image/*,application/pdf,.xlsx,.csv,.txt');
    if (!file) return;
    setLoading(true);
    try {
      setDoc(await readFile(file, profile.locale));
    } catch {
      toast(t.common.error, 'error');
    } finally {
      setLoading(false);
    }
  };

  const save = () => {
    const s: RecognitionScript = { ...effective, name: effective.name.trim() || t.scripts.new, sampleText: doc?.text.slice(0, 24000) ?? effective.sampleText };
    upsertScript(s);
    toast(t.toast.saved);
    onSaved?.(s);
    onClose();
  };

  const remove = async () => {
    if (!(await confirmDialog({ title: t.common.delete, text: t.scripts.deleteConfirm, confirmLabel: t.common.delete, cancelLabel: t.common.cancel, danger: true }))) return;
    removeScript(script.id);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="lg"
      title={t.scripts.editor}
      subtitle={draft.createdBy === 'ai' ? t.scripts.ai : draft.createdBy === 'local' ? t.scripts.local : t.scripts.manual}
      closeLabel={t.common.close}
      dismissable={false}
      footer={
        <div className="flex gap-2">
          {!isNew && <IconButton label={t.common.delete} variant="secondary" onClick={remove}><Trash2 className="size-4.5 text-danger" /></IconButton>}
          <Button variant="primary" block onClick={save}>{t.common.save}</Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Field label={t.scripts.name}>
            <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label={t.scripts.layout}>
            <Segmented size="sm" value={draft.layout} onChange={(v) => set({ layout: v })} options={[{ value: 'grid', label: t.scripts.layoutGrid }, { value: 'list', label: t.scripts.layoutList }]} />
          </Field>
          {draft.layout === 'grid' ? (
            <>
              <Field label={t.scripts.header}>
                <Select value={draft.header} onChange={(e) => set({ header: e.target.value as RecognitionScript['header'] })}>
                  <option value="auto">{t.scripts.headerAuto}</option>
                  <option value="day-numbers">{t.scripts.headerDays}</option>
                  <option value="dates">{t.scripts.headerDates}</option>
                </Select>
              </Field>
              <Field label={t.scripts.personLabel} hint={t.scripts.personLabelHint}>
                <Input value={draft.personLabel} onChange={(e) => set({ personLabel: e.target.value })} placeholder={profile.name} />
              </Field>
              <Field label={t.scripts.emptyMeans}>
                <Segmented size="sm" value={draft.emptyMeans} onChange={(v) => set({ emptyMeans: v })} options={[{ value: 'skip', label: t.scripts.emptySkip }, { value: 'rest', label: t.scripts.emptyRest }]} />
              </Field>
            </>
          ) : (
            <>
              <Field label={t.scripts.dateOrder}>
                <Segmented size="sm" value={draft.dateOrder} onChange={(v) => set({ dateOrder: v })} options={[{ value: 'DMY', label: 'GG.MM' }, { value: 'MDY', label: 'MM/GG' }, { value: 'YMD', label: 'AAAA-MM-GG' }]} />
              </Field>
              <Field label={t.scripts.linePattern} hint={t.scripts.linePatternHint}>
                <Textarea value={draft.linePattern} onChange={(e) => set({ linePattern: e.target.value })} className="min-h-16 font-mono text-[13px]" placeholder="^(?<day>\d{1,2})\.(?<month>\d{1,2})\s+(?<code>\S+)" />
              </Field>
            </>
          )}
          <Field label={t.scripts.keywords} hint={t.scripts.keywordsHint}>
            <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="gastronomia, lugano" />
          </Field>
          <Field label={t.scripts.codeMap} hint={t.scripts.codeMapHint}>
            <div className="space-y-2">
              {draft.codeMap.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={m.from} placeholder={t.scripts.codeMapFrom} onChange={(e) => set({ codeMap: draft.codeMap.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)) })} />
                  <span className="text-muted">→</span>
                  <Input value={m.to} placeholder={t.scripts.codeMapTo} onChange={(e) => set({ codeMap: draft.codeMap.map((x, j) => (j === i ? { ...x, to: e.target.value.toUpperCase() } : x)) })} />
                  <IconButton label={t.common.delete} size="sm" onClick={() => set({ codeMap: draft.codeMap.filter((_, j) => j !== i) })}><X className="size-4" /></IconButton>
                </div>
              ))}
              <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => set({ codeMap: [...draft.codeMap, { from: '', to: '' }] })}>{t.common.add}</Button>
            </div>
          </Field>
          <Field label={t.scripts.ignore}>
            <Input value={ignore} onChange={(e) => setIgnore(e.target.value)} placeholder="* ✓ #" />
          </Field>
        </div>

        <div className="rounded-3xl bg-surface-2 p-4 ring-1 ring-line">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[15px] font-semibold text-ink">{t.scripts.test}</h3>
            <Button size="sm" variant="secondary" icon={loading ? <Spinner className="size-4" /> : <FileUp className="size-4" />} onClick={loadSample}>{t.import.change}</Button>
          </div>
          <p className="mt-1 text-[13px] text-muted">{t.scripts.testHint}</p>
          {test && (
            <>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone={test.quality >= 0.8 ? 'success' : test.quality >= 0.5 ? 'warning' : 'danger'}>{t.scripts.testResult(test.days.length, Math.round(test.quality * 100))}</Badge>
                {test.personLabel && <Badge>{test.personLabel}</Badge>}
                {test.period && <Badge tone="info">{test.period.month}/{test.period.year}</Badge>}
              </div>
              <div className="mt-3 max-h-80 divide-y divide-line overflow-y-auto rounded-2xl bg-surface ring-1 ring-line">
                {test.days.map((d) => (
                  <div key={d.date} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                    <span className="w-20 shrink-0 font-medium text-ink-2">{f.date(d.date, 'EEE d MMM')}</span>
                    <span className="w-16 shrink-0 truncate font-mono text-muted">{d.raw || '∅'}</span>
                    <ShiftChip code={d.code} type={d.typeId ? types[d.typeId] : undefined} kind={d.kind} unknown={d.status === 'unknown'} />
                  </div>
                ))}
                {!test.days.length && <div className="p-4 text-[13px] text-muted">{t.import.nothingFound}</div>}
              </div>
            </>
          )}
        </div>
      </div>
    </Sheet>
  );
}
