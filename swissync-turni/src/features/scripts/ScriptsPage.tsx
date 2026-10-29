import { useMemo, useState } from 'react';
import { Cpu, Download, FileUp, Plus, Sparkles, Upload, Wand2, Wrench } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, PageHeader, SectionTitle } from '@/components/ui/Card';
import { Badge, EmptyState, toast } from '@/components/ui/Feedback';
import { newScript, SYSTEM_SCRIPTS } from '@/engine/recognition/scripts';
import type { RecognitionScript } from '@/engine/types';
import { goBack } from '@/app/router';
import { useStore } from '@/store/store';
import { uid } from '@/lib/id';
import { pickFile, saveFile } from '@/lib/files';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';
import { ScriptEditor } from './ScriptEditor';

export function ScriptsPage() {
  const t = useT();
  const scripts = useStore((s) => s.scripts);
  const usage = useStore((s) => s.ai.usage);
  const upsertScript = useStore((s) => s.upsertScript);
  const [editing, setEditing] = useState<RecognitionScript | null>(null);
  const list = useMemo(() => Object.values(scripts).sort((a, b) => b.stats.lastRunAt - a.stats.lastRunAt || b.updatedAt - a.updatedAt), [scripts]);

  const exportScript = async (s: RecognitionScript) => {
    const { sampleText: _sample, ...rest } = s;
    await saveFile(new Blob([JSON.stringify({ swissyncTurniScript: 1, script: rest }, null, 2)], { type: 'application/json' }), `script-${s.name.replace(/\W+/g, '-').toLowerCase()}.json`, { share: true });
  };

  const importScript = async () => {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const s = data?.script;
      if (!s || !s.layout) throw new Error('invalid');
      upsertScript(newScript({ ...s, id: uid('scr_'), createdBy: s.createdBy === 'system' ? 'manual' : s.createdBy, stats: { runs: 0, lastRunAt: 0, lastAccuracy: 0, daysRecognized: 0 } }));
      toast(t.scripts.imported);
    } catch {
      toast(t.common.error, 'error');
    }
  };

  const icon = (s: RecognitionScript) =>
    s.createdBy === 'ai' ? <Sparkles className="size-5" /> : s.createdBy === 'system' ? <Cpu className="size-5" /> : s.createdBy === 'local' ? <Wand2 className="size-5" /> : <Wrench className="size-5" />;
  const accent = (s: RecognitionScript) =>
    s.createdBy === 'ai' ? 'bg-violet-500/12 text-violet-500' : s.createdBy === 'system' ? 'bg-surface-3 text-ink-2' : 'bg-success/12 text-success';
  const label = (s: RecognitionScript) => (s.createdBy === 'ai' ? t.scripts.ai : s.createdBy === 'system' ? t.scripts.system : s.createdBy === 'local' ? t.scripts.local : t.scripts.manual);

  const row = (s: RecognitionScript, system = false) => (
    <div key={s.id} className="flex items-center gap-3.5 px-4 py-3.5">
      <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-2xl', accent(s))}>{icon(s)}</span>
      <button disabled={system} onClick={() => setEditing(s)} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[15.5px] font-semibold text-ink">{s.name}</span>
          <Badge>{label(s)}</Badge>
          <Badge tone="info">{s.layout === 'grid' ? t.scripts.layoutGrid : t.scripts.layoutList}</Badge>
        </div>
        <div className="mt-0.5 truncate text-[13px] text-muted">
          {system ? s.description : [t.scripts.runs(s.stats.runs), s.stats.runs ? t.scripts.lastAccuracy(Math.round(s.stats.lastAccuracy * 100)) : '', s.keywords.length ? s.keywords.join(', ') : ''].filter(Boolean).join(' · ')}
        </div>
      </button>
      {!system && (
        <IconButton label={t.scripts.exportJson} onClick={() => exportScript(s)}><Download className="size-4.5" /></IconButton>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        onBack={() => goBack('/settings')}
        title={t.scripts.title}
        subtitle={t.scripts.subtitle}
        actions={
          <>
            <IconButton label={t.scripts.importJson} variant="secondary" onClick={importScript}><Upload className="size-4.5" /></IconButton>
            <Button variant="primary" icon={<Plus className="size-4.5" />} onClick={() => setEditing(newScript({ id: uid('scr_'), name: t.scripts.new }))}><span className="hidden sm:inline">{t.scripts.new}</span></Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="col-span-2 p-5 sm:col-span-1">
          <div className="text-[13px] font-medium text-muted">{t.settings.usageLocal}</div>
          <div className="tabular mt-1 text-[30px] font-bold tracking-[-0.03em] text-success">{usage.localImports}</div>
          <div className="text-[13px] text-muted">{t.scripts.savedCalls(usage.localImports)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-[13px] font-medium text-muted">{t.settings.usageScripts}</div>
          <div className="tabular mt-1 text-[30px] font-bold tracking-[-0.03em] text-ink">{list.length}</div>
        </Card>
        <Card className="p-5">
          <div className="text-[13px] font-medium text-muted">{t.settings.usageRequests}</div>
          <div className="tabular mt-1 text-[30px] font-bold tracking-[-0.03em] text-violet-500">{usage.requests}</div>
        </Card>
      </div>

      <SectionTitle>{t.nav.scripts}</SectionTitle>
      <Card className="overflow-hidden">
        {list.length === 0 ? (
          <EmptyState icon={<FileUp className="size-6" />} title={t.scripts.empty} />
        ) : (
          <div className="divide-y divide-line">{list.map((s) => row(s))}</div>
        )}
      </Card>

      <SectionTitle>{t.scripts.system}</SectionTitle>
      <Card className="overflow-hidden">
        <div className="divide-y divide-line">{SYSTEM_SCRIPTS.map((s) => row(s, true))}</div>
      </Card>

      {editing && <ScriptEditor key={editing.id} open={!!editing} script={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
