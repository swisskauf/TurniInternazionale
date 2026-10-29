import type { ServerEnv } from './env';

type Purpose = 'verify' | 'reset';

const TEXT: Record<string, Record<Purpose, { subject: string; intro: string }> & { valid: string; ignore: string }> = {
  it: {
    verify: { subject: 'Il tuo codice Swissync Turni', intro: 'Ecco il codice per confermare il tuo account Swissync Turni:' },
    reset: { subject: 'Reimposta la password di Swissync Turni', intro: 'Ecco il codice per reimpostare la password del tuo account Swissync Turni:' },
    valid: 'Il codice è valido per 15 minuti.',
    ignore: 'Se non hai richiesto tu questo codice, ignora questa email.',
  },
  en: {
    verify: { subject: 'Your Swissync Turni code', intro: 'Here is the code to confirm your Swissync Turni account:' },
    reset: { subject: 'Reset your Swissync Turni password', intro: 'Here is the code to reset the password of your Swissync Turni account:' },
    valid: 'The code is valid for 15 minutes.',
    ignore: 'If you didn’t ask for this code, just ignore this email.',
  },
  de: {
    verify: { subject: 'Dein Swissync Turni Code', intro: 'Hier ist der Code zur Bestätigung deines Swissync Turni Kontos:' },
    reset: { subject: 'Swissync Turni Passwort zurücksetzen', intro: 'Hier ist der Code zum Zurücksetzen des Passworts deines Swissync Turni Kontos:' },
    valid: 'Der Code ist 15 Minuten gültig.',
    ignore: 'Wenn du diesen Code nicht angefordert hast, ignoriere diese E-Mail.',
  },
  fr: {
    verify: { subject: 'Ton code Swissync Turni', intro: 'Voici le code pour confirmer ton compte Swissync Turni :' },
    reset: { subject: 'Réinitialiser ton mot de passe Swissync Turni', intro: 'Voici le code pour réinitialiser le mot de passe de ton compte Swissync Turni :' },
    valid: 'Le code est valable 15 minutes.',
    ignore: 'Si tu n’as pas demandé ce code, ignore cet e-mail.',
  },
};

export function codeEmail(code: string, purpose: Purpose, locale: string): { subject: string; text: string; html: string } {
  const t = TEXT[locale] ?? TEXT.it;
  const subject = `${t[purpose].subject}: ${code}`;
  const text = `${t[purpose].intro}\n\n${code}\n\n${t.valid}\n${t.ignore}\n\nSwissync Turni`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#14161f">
<div style="max-width:480px;margin:0 auto;padding:32px 20px">
<div style="background:#fff;border-radius:20px;padding:28px 24px;border:1px solid #e7e7ec">
<div style="font-weight:700;font-size:15px;color:#e5223f">Swissync Turni</div>
<p style="font-size:16px;line-height:1.5;margin:18px 0 8px">${t[purpose].intro}</p>
<div style="font-size:34px;font-weight:700;letter-spacing:8px;margin:14px 0 18px">${code}</div>
<p style="font-size:14px;color:#5d6070;margin:0">${t.valid}<br>${t.ignore}</p>
</div></div></body></html>`;
  return { subject, text, html };
}

/** Sends an e-mail through Resend. Returns false when sending isn't configured or failed. */
export async function sendMail(env: ServerEnv, to: string, mail: { subject: string; text: string; html: string }): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || 'Swissync Turni <no-reply@swissync.org>', to: [to], subject: mail.subject, text: mail.text, html: mail.html }),
  });
  return res.ok;
}
