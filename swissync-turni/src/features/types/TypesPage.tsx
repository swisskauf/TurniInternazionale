import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, ImagePlus, Layers, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, PageHeader, SectionTitle } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Form';
import { Sheet } from '@/components/ui/Sheet';
import { Badge, EmptyState, toast } from '@/components/ui/Feedback';
import { ShiftChip } from '@/components/ShiftChip';
import { useRoute, goBack } from '@/app/router';
import { AiError } from '@/ai/client';
import { shiftTypesWithAi, legendToTypes } from '@/ai/tasks';
import { parseLegendText } from '@/engine/legend';
import { normalizeCode } from '@/engine/recognition/tokens';
import { fmtSegments, totalSegmentMinutes } from '@/engine/time';
import type { DayKind, ShiftType } from '@/engine/types';
import { activeTypes, useStore } from '@/store/store';
import { drawScaled, loadImage, toJpegDataUrl } from '@/lib/image';
import { pickFile } from '@/lib/files';
import { useT } from '@/i18n';
import { useFmt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { TypeEditor, blankType } from './TypeEditor';

export function TypesPage() {
  const t = useT();
  const f = useFmt();
  const { params } = useRoute();
  const types = useStore((s) => s.types);
  const entries = useStore((s) => s.entries);
  const upsertType = useStore((s) => s.upsertType);
  const ai = useStore((s) => s.ai);
  const list = useMemo(() => activeTypes(types), [types]);
  const usage = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of Object.values(entries)) if (e.typeId) m[e.typeId] = (m[e.typeId] ?? 0) + 1;
    return m;
  }, [entries]);
  const [editing, setEditing] = useState<ShiftType | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [text, setText] = useState('');
  const [proposals, setProposals] = useState<ShiftType[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const code = params.get('code');
    if (code) setEditing(blankType(normalizeCode(code)));
  }, [params]);

  const groups = useMemo(() => {
    const g: Partial<Record<DayKind, ShiftType[]>> = {};
    for (const ty of list) (g[ty.kind] ??= []).push(ty);
    return Object.entries(g) as [DayKind, ShiftType[]][];
  }, [list]);

  const showProposals = (drafts: ShiftType[]) => {
    const fresh = drafts.filter((d) => !list.some((x) => normalizeCode(x.code) === normalizeCode(d.code)));
    setProposals(fresh);
    setPicked(new Set(fresh.map((p) => p.id)));
  };

  const parseLocal = () => {
    const drafts = parseLegendText(text);
    showProposals(legendToTypes(drafts.map((d) => ({ ...d })), 'local'));
  };

  const fromAi = async (images?: string[]) => {
    setBusy(true);
    try {
      showProposals(await shiftTypesWithAi({ text: text.trim() || undefined, images }));
    } catch (e) {
      toast(t.ai.errors[e instanceof AiError ? e.code : 'provider_error'] ?? t.common.error, 'error');
    } finally {
      setBusy(false);
    }
  };

  const fromPhoto = async () => {
    const file = await pickFile('image/*');
    if (!file) return;
    const img = await loadImage(file);
    await fromAi([toJpegDataUrl(drawScaled(img, 2048))]);
  };

  const addPicked = () => {
    const chosen = (proposals ?? []).filter((p) => picked.has(p.id));
    chosen.forEach(upsertType);
    toast(t.types.addSelected(chosen.length));
    setProposals(null);
    setText('');
    setLegendOpen(false);
    setAiOpen(false);
  };

  const proposalList = proposals && (
    <div className="mt-4">
      <h4 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">{t.types.proposals}</h4>
      {proposals.length === 0 && <p className="text-[14px] text-muted">{t.types.noProposals}</p>}
      <div className="space-y-2">
        {proposals.map((p) => (
          <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2.5 ring-1 ring-line">
            <input type="checkbox" className="size-4.5 accent-[var(--brand)]" checked={picked.has(p.id)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} />
            <ShiftChip code={p.code} type={p} size="md" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-ink">{p.name}</span>
              <span className="tabular block truncate text-[12.5px] text-muted">{p.segments.length ? fmtSegments(p.segments) : t.kinds[p.kind]}{p.unpaidBreakMin ? ` · ${p.unpaidBreakMin} ${t.common.min}` : ''}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader
        onBack={() => goBack('/settings')}
        title={t.types.title}
        subtitle={t.types.subtitle}
        actions={<Button variant="primary" icon={<Plus className="size-4.5" />} onClick={() => setEditing(blankType())}><span className="hidden sm:inline">{t.types.add}</span></Button>}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button onClick={() => { setProposals(null); setLegendOpen(true); }} className="flex items-start gap-3.5 rounded-[22px] bg-surface p-4 text-left shadow-card ring-1 ring-line transition hover:ring-line-strong">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-500"><ClipboardList className="size-5" /></span>
          <span>
            <span className="flex items-center gap-2 text-[15.5px] font-semibold text-ink">{t.types.fromLegend} <Badge tone="success">{t.common.free}</Badge></span>
            <span className="mt-0.5 block text-[13px] leading-snug text-muted">{t.types.fromLegendHint}</span>
          </span>
        </button>
        <button disabled={ai.mode === 'off'} onClick={() => { setProposals(null); setAiOpen(true); }} className="flex items-start gap-3.5 rounded-[22px] bg-surface p-4 text-left shadow-card ring-1 ring-line transition hover:ring-line-strong disabled:opacity-50">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/12 text-violet-500"><Sparkles className="size-5" /></span>
          <span>
            <span className="block text-[15.5px] font-semibold text-ink">{t.types.withAi}</span>
            <span className="mt-0.5 block text-[13px] leading-snug text-muted">{t.types.withAiHint}</span>
          </span>
        </button>
      </div>

      {list.length === 0 && (
        <Card className="mt-5"><EmptyState icon={<Layers className="size-6" />} title={t.types.empty} action={<Button variant="primary" onClick={() => setEditing(blankType())}>{t.types.add}</Button>} /></Card>
      )}

      {groups.map(([kind, items]) => (
        <div key={kind}>
          <SectionTitle>{t.kinds[kind]}</SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((ty) => (
              <button key={ty.id} onClick={() => setEditing(ty)} className="flex items-center gap-3.5 rounded-[22px] bg-surface p-3.5 text-left shadow-card ring-1 ring-line transition hover:-translate-y-0.5 hover:ring-line-strong">
                <ShiftChip code={ty.code} type={ty} size="lg" className="min-w-14" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[15.5px] font-semibold text-ink">{ty.name}</span>
                    {ty.source === 'ai' && <Sparkles className="size-3.5 shrink-0 text-violet-500" />}
                  </div>
                  <div className="tabular truncate text-[13px] text-muted">{ty.segments.length ? fmtSegments(ty.segments) : ty.creditedHours ? `${f.hours(ty.creditedHours)} ${t.common.h}` : t.kinds[ty.kind]}</div>
                  <div className="mt-1 flex items-center gap-2 text-[12px] text-faint">
                    {ty.segments.length > 0 && <span className="tabular font-semibold text-ink-2">{f.minutes(totalSegmentMinutes(ty.segments) - ty.unpaidBreakMin)} {t.common.h}</span>}
                    {usage[ty.id] ? <span>{t.types.used(usage[ty.id])}</span> : null}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}

      {editing && <TypeEditor key={editing.id} open={!!editing} type={editing} onClose={() => setEditing(null)} />}

      <Sheet open={legendOpen} onClose={() => setLegendOpen(false)} title={t.types.fromLegend} subtitle={t.types.fromLegendHint} closeLabel={t.common.close}
        footer={proposals?.length ? <Button variant="primary" block disabled={!picked.size} onClick={addPicked}>{t.types.addSelected(picked.size)}</Button> : <Button variant="primary" block disabled={!text.trim()} onClick={parseLocal}>{t.common.continue}</Button>}>
        <Textarea value={text} onChange={(e) => { setText(e.target.value); setProposals(null); }} className="min-h-40 font-mono text-[13.5px]" placeholder={'P1 08:00-12:00 12:36-17:18\nN 22:00-06:00 pausa 30 min\nGR riposo\nF ferie'} />
        {proposalList}
      </Sheet>

      <Sheet open={aiOpen} onClose={() => setAiOpen(false)} title={t.types.withAi} subtitle={t.ai.consent} closeLabel={t.common.close}
        footer={proposals?.length ? <Button variant="primary" block disabled={!picked.size} onClick={addPicked}>{t.types.addSelected(picked.size)}</Button> : (
          <div className="flex gap-2">
            <Button icon={<ImagePlus className="size-4.5" />} onClick={fromPhoto} disabled={busy}>{t.import.image}</Button>
            <Button variant="primary" block loading={busy} disabled={!text.trim()} icon={<Sparkles className="size-4.5" />} onClick={() => fromAi()}>{t.common.continue}</Button>
          </div>
        )}>
        <Textarea value={text} onChange={(e) => { setText(e.target.value); setProposals(null); }} className={cn('min-h-36')} placeholder={t.types.describePlaceholder} />
        {proposalList}
      </Sheet>
    </div>
  );
}
