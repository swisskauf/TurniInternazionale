# Swissync Turni

**Le tue ore, dal tuo piano turni.** App della piattaforma Swissync per chiunque lavori a turni:
importa il piano (foto, PDF, Excel/CSV o testo), calcola le ore lavorate e i guadagni, e
consegna al datore di lavoro un rapporto PDF dettagliato — senza importi.

Web app installabile (PWA) + app native iOS e Android (Capacitor) dallo stesso codice.

## Cosa fa

| Funzione | Come |
|---|---|
| **Turni definiti da te** | Codici del piano (es. `P1 = 08:00–12:00 + 12:36–17:18`) creati a mano, incollando la legenda (letta in locale, gratis) o con xAI (foto della legenda o descrizione), sempre con la tua conferma. |
| **Riconoscimento del piano senza consumare xAI** | Gli *script di riconoscimento* leggono il piano **sul dispositivo**: OCR locale (Tesseract, incluso nell'app, funziona offline), testo dei PDF, celle di Excel/CSV, messaggi incollati. Due script integrati (griglia persone×giorni e trasposta, elenco con date) coprono la maggior parte dei piani. |
| **xAI solo all'inizio, se serve** | Se nessuno script riconosce il piano, xAI analizza il documento **una volta** e genera uno script (parole chiave, etichetta della tua riga, correzioni OCR, struttura). Lo script viene testato in locale sullo stesso documento (affidabilità %) e salvato: dalle importazioni successive il piano viene letto in locale, con 0 chiamate xAI. |
| **Revisione prima di salvare** | Ogni importazione mostra giorni nuovi/cambiati/modificati a mano, codici sconosciuti da definire, e permette correzioni puntuali. Annulla con un tocco. |
| **Ore lavorate** | Pause pagate/non pagate, turni spezzati e notturni (oltre la mezzanotte), ore notturne, domenicali, sabato, festive (calendari CH per cantone, IT, DE, FR, AT + festivi personalizzati), straordinari settimanali/giornalieri, saldo rispetto al contratto, timbratura entrata/uscita. |
| **PDF per il datore di lavoro** | Riepilogo, dettaglio giornaliero con subtotali settimanali, legenda turni, dichiarazione e firme, in IT/EN/DE/FR. **Nessun importo.** Più export CSV e calendario `.ics`. |
| **Guadagni** | Compilazione guidata (6 passi, preset Svizzera oraria/mensile, Italia, generico) **oppure** caricando una busta paga: xAI estrae paga oraria, supplementi, indennità e trattenute e configura il profilo (lo confermi tu). Confronto stima ↔ busta paga reale. |
| **Privacy** | Nessun account, dati solo sul dispositivo (IndexedDB), backup/ripristino JSON. I documenti vanno a xAI solo su tua richiesta. |

## Sviluppo

```bash
npm ci
cp .env.example .env.local   # aggiungi XAI_API_KEY per le funzioni xAI
npm run dev                  # http://localhost:3000  (anche /api/ai in locale)
npm test                     # motori: ore, paga, festivi, riconoscimento
npm run build                # typecheck + build di produzione in dist/
```

Dati di esempio: apri `http://localhost:3000/?demo=it` (o `en`, `de`, `fr`).

### Struttura

```
src/engine/            logica pura e testata (nessuna UI)
  hours.ts             calcolo ore: notturne, domenicali, festive, straordinari, saldo
  pay.ts               calcolo lordo/netto con supplementi, indennità e trattenute
  holidays.ts          festivi CH (per cantone), IT, DE, FR, AT
  recognition/         script di riconoscimento: griglia, griglia trasposta, elenco, codici, periodo
src/import/readers.ts  foto (OCR locale), PDF (pdf.js), Excel/CSV, testo → token posizionati
src/ai/                client xAI e trasformazione delle risposte (script, legenda, busta paga)
server/                endpoint /api/ai: compiti fissi con JSON schema, la chiave resta sul server
api/ai.ts              funzione Vercel che espone server/ai.ts
src/report/pdf.ts      rapporto ore PDF (jsPDF)
src/features/…         schermate: Oggi, Calendario, Importa, Ore, Guadagni, Turni, Script, Impostazioni
android/, ios/         progetti nativi Capacitor
```

### xAI

L'endpoint `/api/ai` accetta solo 4 compiti (`analyze-plan`, `refine-script`, `shift-types`,
`payslip`) con input limitati e output in JSON schema rigoroso: non è un proxy generico.
Modello predefinito `grok-4.7` (configurabile con `XAI_MODEL`), limite giornaliero per IP
(`AI_DAILY_LIMIT`). Gli utenti possono usare la propria chiave xAI (Impostazioni → Assistente
xAI) senza limiti della piattaforma.

## Produzione e store

Vedi **[docs/STORE_RELEASE.md](docs/STORE_RELEASE.md)**: Vercel (web + API), App Store,
Google Play, Microsoft Store (PWA). I workflow GitHub Actions sono in
`.github/workflows/swissync-turni-*.yml`.

## Piattaforma Swissync

`swissync.app.json` (servito anche come `/swissync-app.json`) descrive l'app per il launcher
della piattaforma: nome, icona, colori, deep link, bundle id. Per copiarla nella cartella
Swissync sul Mac: `bash scripts/install-on-mac.sh "/percorso/Swissync"`.
