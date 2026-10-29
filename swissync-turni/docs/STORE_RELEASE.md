# Pubblicazione: produzione web e store

Tutto il codice, i progetti nativi e le automazioni sono pronti. Restano i passaggi che
richiedono **i tuoi account** (Vercel, Apple, Google, Microsoft, xAI): nessuno può farli al
posto tuo perché servono credenziali, pagamenti e accettazione dei contratti.

Identificativi dell'app

| | |
|---|---|
| Nome | Swissync Turni |
| Bundle ID iOS / Package Android | `ch.swissync.turni` |
| Versione | 1.0.0 |
| Categoria | Produttività (secondaria: Business) |
| Icona store | `resources/icon-1024.png` (iOS), `resources/icon-512-store.png` (Google Play) |
| Privacy policy | `https://<tuo-dominio>/privacy.html` |

---

## 1. Produzione web + API xAI (Vercel) — ~10 minuti

1. Su <https://vercel.com/new> importa il repository `swisskauf/TurniInternazionale`.
2. **Root Directory**: `swissync-turni` (Framework: Vite — viene rilevato da `vercel.json`).
3. **Environment Variables** (Production):
   - `XAI_API_KEY` = la tua chiave da <https://console.x.ai>
   - facoltative: `XAI_MODEL` (default `grok-4.7`), `XAI_REASONING` (`medium`),
     `AI_DAILY_LIMIT` (default 40 richieste/giorno per IP), `ALLOWED_ORIGINS`.
4. Deploy. Ottieni un URL tipo `https://swissync-turni.vercel.app` (puoi collegare un dominio,
   es. `turni.swissync.ch`).
5. Verifica: `https://<url>/api/ai` deve rispondere `{"ok":true,"configured":true,...}`.

Da quel momento ogni push sul branch di produzione viene pubblicato automaticamente.
In alternativa, il workflow **Swissync Turni · Release** pubblica con i secret
`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.

> L'URL di produzione serve anche alle app native: impostalo su GitHub come
> *Repository variable* `SWISSYNC_TURNI_API_BASE` (es. `https://turni.swissync.ch`).
> Per build locali: `VITE_API_BASE=https://turni.swissync.ch npm run cap:sync`.

---

## 2. Apple App Store (iPhone, iPad, Mac con Apple Silicon)

Prerequisiti: Apple Developer Program (99 USD/anno), un Mac con Xcode 26+.

1. **App Store Connect → App → +**: piattaforma iOS, nome *Swissync Turni*, lingua principale
   Italiano, bundle ID `ch.swissync.turni` (crealo prima in *Certificates, IDs & Profiles*), SKU
   `swissync-turni`.
2. **Scheda dell'app**: testi pronti in `store/listing/<lingua>.md` (nome, sottotitolo,
   descrizione, parole chiave, novità). Screenshot pronti in `store/screenshots/`
   (iPhone 6.9" 1320×2868 e iPad 13" 2064×2752). URL privacy: `/privacy.html` della produzione.
3. **Privacy dell'app** (questionario): *Data Not Collected* — i dati restano sul dispositivo;
   i documenti inviati a xAI su richiesta dell'utente non vengono conservati.
4. **Build**
   - *Da Mac*: `npm ci && VITE_API_BASE=<url> npm run cap:ios` → in Xcode seleziona il tuo
     Team (Signing & Capabilities) → *Product › Archive* → *Distribute App* → App Store Connect.
   - *Da GitHub Actions* (senza Mac): crea una chiave API in App Store Connect
     (*Users and Access › Integrations › App Store Connect API*, ruolo *App Manager*) e aggiungi
     i secret `APP_STORE_CONNECT_API_KEY_BASE64` (contenuto del file `.p8` in base64),
     `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APPLE_TEAM_ID`, poi lancia
     *Actions › Swissync Turni · Release*. La build arriva su TestFlight.
5. Da TestFlight → *Invia per la revisione*. Note per il revisore: «L'app funziona senza
   account. Per provare l'importazione usa Impostazioni › Dati › Carica dati di esempio».

Mac: le app iPhone/iPad girano anche su Mac con Apple Silicon (App Store Connect › Prezzi e
disponibilità › *Disponibile su Mac*). Per un'app macOS nativa separata servirebbe Mac Catalyst.

---

## 3. Google Play

Prerequisiti: account Google Play Console (25 USD una tantum).

1. **Crea app**: nome *Swissync Turni*, lingua predefinita Italiano, App, Gratis.
2. **Chiave di caricamento** (una volta, sul tuo computer):
   ```bash
   keytool -genkeypair -v -keystore swissync-upload.jks -alias swissync -keyalg RSA -keysize 2048 -validity 10000
   ```
   Conservala con cura. Play App Signing gestisce la chiave di firma finale.
3. **Secret GitHub**: `ANDROID_KEYSTORE_BASE64` (`base64 -i swissync-upload.jks`),
   `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`swissync`), `ANDROID_KEY_PASSWORD`.
4. **Account di servizio** per il caricamento automatico: Google Cloud → service account con
   chiave JSON → in Play Console *Utenti e autorizzazioni* invitalo con permessi di rilascio →
   secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.
5. Lancia *Actions › Swissync Turni · Release* (track `internal`). La **prima** versione va
   caricata a mano: scarica l'artefatto `swissync-turni-android-release-aab` e caricalo in
   *Test › Test interno*.
6. Scheda dello store: testi in `store/listing/`, grafica in `store/screenshots/`,
   icona 512 `resources/icon-512-store.png`, feature graphic `store/feature-graphic.png`.
   *Sicurezza dei dati*: nessun dato raccolto né condiviso; i documenti inviati a xAI su
   richiesta sono «trattati in modo temporaneo».

Senza Play Store puoi installare subito l'APK di debug generato dalla CI
(*Actions › Swissync Turni · CI › artefatto swissync-turni-android-debug-apk*).

---

## 4. Microsoft Store (Windows) e installazione PWA

La web app è una PWA completa (manifest, service worker, offline).
1. Apri <https://www.pwabuilder.com> e inserisci l'URL di produzione.
2. *Package for stores › Windows* → carica il pacchetto in Partner Center
   (account sviluppatore Microsoft).
Su desktop e Android l'app si può anche installare direttamente dal browser
(«Installa app»); su iPhone: Condividi › *Aggiungi alla schermata Home*.

---

## Checklist prima della pubblicazione

- [ ] `XAI_API_KEY` impostata su Vercel e `/api/ai` risponde `configured: true`
- [ ] `SWISSYNC_TURNI_API_BASE` impostata (serve alle app native per usare xAI)
- [ ] Contatto privacy aggiornato in `public/privacy.html` (email o pagina di supporto)
- [ ] Testi e screenshot caricati negli store
- [ ] Test su un dispositivo reale: foto del piano → revisione → salvataggio → PDF
