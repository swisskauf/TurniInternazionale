# Pubblicazione: produzione web e store

Il codice, i progetti nativi e le automazioni sono pronti. Swissync Turni gira sulla stessa
infrastruttura della piattaforma Swissync (Cloudflare, dominio `swissync.org`, editore
**Swisskauf Sagl**, team Apple `R98X48G958`).

Identificativi dell'app

| | |
|---|---|
| Nome | Swissync Turni |
| Bundle ID iOS / Package Android | `org.swissync.turni` |
| Versione | 1.0.0 |
| Categoria | Produttività (secondaria: Business) |
| Web app e API | `https://turni.swissync.org` |
| Privacy policy | `https://turni.swissync.org/privacy.html` |
| Supporto | `https://turni.swissync.org/support.html` · support@swissync.org |
| Eliminazione account (Google Play) | `https://turni.swissync.org/delete-account.html` |

---

## 1. Produzione: web app + API + account (Cloudflare)

Un unico Worker `swissync-turni` serve la web app, l'API (`/api/ai`, `/api/auth/*`,
`/api/sync`) e usa il database D1 `swissync-turni` (giurisdizione UE).

Dal Mac, con `wrangler` collegato all'account Cloudflare di Swissync:

```bash
cd swissync-turni
XAI_API_KEY=… RESEND_API_KEY=… APPLE_SIGNIN_KEY_FILE=~/…/AuthKey_XXXXXXXXXX.p8 bash scripts/deploy-cloudflare.sh
```

Lo script (ripetibile): crea il database UE se manca, applica le migrazioni, compila, pubblica
con il dominio `turni.swissync.org`, imposta i segreti mancanti (`TOKEN_SECRET` generato).
Le variabili sono facoltative: senza `XAI_API_KEY` l'analisi xAI risulta non configurata, senza
`RESEND_API_KEY` i codici email non partono.

Segreti del Worker (`npx wrangler secret put NOME`): `TOKEN_SECRET`, `XAI_API_KEY`,
`RESEND_API_KEY` (Resend, dominio `swissync.org`), `APPLE_KEY_ID` + `APPLE_PRIVATE_KEY`
(chiave «Sign in with Apple», per revocare l'accesso quando un account viene eliminato).
Variabili in `wrangler.toml` (limite xAI mensile `AI_MONTHLY_LIMIT = 6`, mittente email…).

CI: il workflow **Swissync Turni · Release** pubblica con i secret `CLOUDFLARE_API_TOKEN`
(permessi *Workers Scripts: Edit*, *D1: Edit*, *Workers Routes: Edit*) e `CLOUDFLARE_ACCOUNT_ID`.

### Accesso con Google (facoltativo)

1. Google Cloud Console → *API e servizi → Credenziali* → crea tre client OAuth:
   *Web* (origine `https://turni.swissync.org`), *iOS* (bundle `org.swissync.turni`),
   *Android* (package `org.swissync.turni` + SHA-1 della chiave di firma di Play).
2. In `wrangler.toml` imposta `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID` e
   `GOOGLE_CLIENT_IDS` (tutti e tre, separati da virgola) e ripubblica.
3. iOS: aggiungi a `ios/App/App/Info.plist` lo URL scheme con l'ID client iOS invertito
   (`com.googleusercontent.apps.…`).
Il pulsante «Continua con Google» compare da solo appena il server lo annuncia.

### Accesso con Apple

Su iPhone/iPad funziona senza configurazioni aggiuntive (capability già nel progetto: Xcode la
attiva sull'App ID con la firma automatica). Per il web serve un *Services ID* con dominio
`turni.swissync.org` → `APPLE_SERVICES_ID` e aggiungerlo a `APPLE_CLIENT_IDS`.

---

## 2. Apple App Store (iPhone, iPad, Mac con Apple Silicon)

Prerequisiti: Apple Developer Program (99 USD/anno), un Mac con Xcode 26+.

1. **App Store Connect → App → +**: piattaforma iOS, nome *Swissync Turni*, lingua principale
   Italiano, bundle ID `org.swissync.turni` (crealo prima in *Certificates, IDs & Profiles*), SKU
   `swissync-turni`.
2. **Scheda dell'app**: testi pronti in `store/listing/<lingua>.md` (nome, sottotitolo,
   descrizione, parole chiave, novità). Screenshot pronti in `store/screenshots/`
   (iPhone 6.9" 1320×2868 e iPad 13" 2064×2752). URL privacy: `/privacy.html` della produzione.
3. **Privacy dell'app** (questionario): *Dati collegati all'utente* → **Informazioni di contatto
   › Indirizzo email**, **Nome**, **Contenuti dell'utente › Altri contenuti** (turni sincronizzati),
   tutti per *Funzionalità dell'app*, nessun tracciamento. Senza account nulla lascia il
   dispositivo; i documenti inviati a xAI su richiesta non vengono conservati. Il file
   `ios/App/App/PrivacyInfo.xcprivacy` dichiara gli stessi dati.
4. **Build**
   - *Da Mac*: `npm ci && VITE_API_BASE=<url> npm run cap:ios` → in Xcode seleziona il tuo
     Team (Signing & Capabilities) → *Product › Archive* → *Distribute App* → App Store Connect.
   - *Da GitHub Actions* (senza Mac): crea una chiave API in App Store Connect
     (*Users and Access › Integrations › App Store Connect API*, ruolo *App Manager*) e aggiungi
     i secret `APP_STORE_CONNECT_API_KEY_BASE64` (contenuto del file `.p8` in base64),
     `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APPLE_TEAM_ID`, poi lancia
     *Actions › Swissync Turni · Release*. La build arriva su TestFlight.
5. Da TestFlight → *Invia per la revisione*. Note per il revisore: «L'app funziona senza
   account. L'account (email, Apple, Google) è facoltativo e serve a sincronizzare i dati e
   a usare xAI (6 analisi al mese). L'account si elimina da Account › Elimina account. Per
   provare l'importazione usa Impostazioni › Dati › Carica dati di esempio».

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
   *Sicurezza dei dati*: raccolti (solo con account) email, nome e contenuti dell'app per la
   funzionalità; cifrati in transito; eliminabili su richiesta (in app e su
   `https://turni.swissync.org/delete-account.html`); nessuna condivisione. I documenti inviati a
   xAI su richiesta sono «trattati in modo temporaneo».

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

- [ ] `https://turni.swissync.org/api/auth/config` risponde `accounts: true`
- [ ] `https://turni.swissync.org/api/ai` risponde `configured: true` (segreto `XAI_API_KEY`)
- [ ] Registrazione con email: arriva il codice (segreto `RESEND_API_KEY`)
- [ ] Testi e screenshot caricati negli store
- [ ] Test su un dispositivo reale: foto del piano → revisione → salvataggio → PDF
