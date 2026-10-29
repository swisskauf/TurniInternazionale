import { useState } from 'react';
import { FileUp, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Badge, Spinner, toast } from '@/components/ui/Feedback';
import { AiError } from '@/ai/client';
import { payslipRecord, payslipToProfile, readPayslipWithAi, type PayslipOutput } from '@/ai/tasks';
import { readPdf } from '@/import/readers';
import { drawScaled, loadImage, toJpegDataUrl } from '@/lib/image';
import { pickFile } from '@/lib/files';
import { useStore } from '@/store/store';
import { navigate } from '@/app/router';
import { useT } from '@/i18n';
import { useFmt } from '@/lib/format';

export function PayslipSheet({ open, onClose, mode }: { open: boolean; onClose: () => void; mode: 'setup' | 'compare' }) {
  const t = useT();
  const f = useFmt();
  const pay = useStore((s) => s.pay);
  const profile = useStore((s) => s.profile);
  const setPay = useStore((s) => s.setPay);
  const addPayslip = useStore((s) => s.addPayslip);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PayslipOutput | null>(null);
  const [error, setError] = useState('');

  const pick = async () => {
    const file = await pickFile('application/pdf,image/*');
    if (!file) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      let input: { text?: string; images?: string[] };
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const doc = await readPdf(file, profile.locale);
        // A text layer is cheaper and exact; scanned payslips go as images.
        input = doc.text.length > 300 ? { text: doc.text, images: doc.images.slice(0, 1) } : { images: doc.images.slice(0, 2) };
      } else {
        const img = await loadImage(file);
        input = { images: [toJpegDataUrl(drawScaled(img, 2048))] };
      }
      setResult(await readPayslipWithAi(input));
    } catch (e) {
      setError(t.ai.errors[e instanceof AiError ? e.code : 'provider_error'] ?? t.common.error);
    } finally {
      setBusy(false);
    }
  };

  const useAsProfile = () => {
    if (!result) return;
    setPay(payslipToProfile(result, pay));
    addPayslip(payslipRecord(result));
    toast(t.payslip.applied);
    onClose();
    navigate('/pay-setup');
  };

  const saveCompare = () => {
    if (!result) return;
    addPayslip(payslipRecord(result));
    toast(t.toast.saved);
    onClose();
  };

  const cur = result?.currency || pay.currency;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.payslip.title}
      closeLabel={t.common.close}
      footer={
        result ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            {mode === 'setup' || !pay.configured ? (
              <>
                <Button onClick={saveCompare}>{t.payslip.saveForCompare}</Button>
                <Button variant="primary" block onClick={useAsProfile}>{t.payslip.applyProfile}</Button>
              </>
            ) : (
              <>
                <Button onClick={useAsProfile}>{t.payslip.applyProfile}</Button>
                <Button variant="primary" block onClick={saveCompare}>{t.payslip.saveForCompare}</Button>
              </>
            )}
          </div>
        ) : (
          <Button variant="primary" block icon={<FileUp className="size-4.5" />} loading={busy} onClick={pick}>{t.payslip.pick}</Button>
        )
      }
    >
      {!result && !busy && (
        <div className="flex items-start gap-3 rounded-2xl bg-surface-2 p-4 text-[13.5px] leading-relaxed text-muted ring-1 ring-line">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" />
          {t.payslip.privacy}
        </div>
      )}
      {busy && (
        <div className="flex flex-col items-center py-10 text-center">
          <span className="mb-4 flex size-16 items-center justify-center rounded-3xl bg-violet-500/12 text-violet-500"><Sparkles className="size-7" /></span>
          <p className="text-[15px] font-semibold text-ink">{t.payslip.reading}</p>
          <Spinner className="mt-4" />
        </div>
      )}
      {error && <p className="mt-3 rounded-2xl bg-danger/10 p-3 text-[14px] text-ink ring-1 ring-danger/25">{error}</p>}
      {result && (
        <div className="space-y-4">
          <h3 className="text-[16px] font-semibold text-ink">{t.payslip.found}</h3>
          <div className="grid grid-cols-2 gap-2">
            <Info label={t.payslip.employer} value={result.employer || '—'} />
            <Info label={t.payslip.period} value={result.period?.year ? `${String(result.period.month).padStart(2, '0')}/${result.period.year}` : '—'} />
            <Info label={result.payType === 'hourly' ? t.wizard.hourlyRate : t.wizard.monthlySalary} value={result.payType === 'hourly' ? f.money(result.hourlyRate, { currency: cur }) : f.money(result.monthlySalary, { currency: cur })} />
            <Info label={t.earnings.paidHours} value={result.hoursPaid ? f.hours(result.hoursPaid) : '—'} />
            <Info label={t.earnings.gross} value={f.money(result.gross, { currency: cur })} />
            <Info label={t.payslip.net} value={f.money(result.net, { currency: cur })} strong />
          </div>
          <div className="divide-y divide-line overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-line">
            {result.earnings.map((e, i) => (
              <div key={`e${i}`} className="flex items-center gap-3 px-3.5 py-2 text-[13.5px]">
                <span className="min-w-0 flex-1 truncate text-ink">{e.label}</span>
                {e.pct ? <Badge>{e.pct}%</Badge> : null}
                <span className="tabular font-semibold text-ink">{f.money(e.amount, { currency: cur })}</span>
              </div>
            ))}
            {result.deductions.map((d, i) => (
              <div key={`d${i}`} className="flex items-center gap-3 px-3.5 py-2 text-[13.5px]">
                <span className="min-w-0 flex-1 truncate text-ink-2">{d.label}</span>
                {d.pct ? <Badge tone="danger">{d.pct}%</Badge> : null}
                <span className="tabular font-semibold text-danger">− {f.money(d.amount, { currency: cur })}</span>
              </div>
            ))}
          </div>
          {result.notes && <p className="text-[13px] text-muted">{result.notes}</p>}
        </div>
      )}
    </Sheet>
  );
}

function Info({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-3 ring-1 ring-line">
      <div className="truncate text-[12px] font-medium text-muted">{label}</div>
      <div className={strong ? 'tabular truncate text-[17px] font-bold text-brand' : 'tabular truncate text-[15px] font-semibold text-ink'}>{value}</div>
    </div>
  );
}
