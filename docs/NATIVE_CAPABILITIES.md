# NATIVE_CAPABILITIES — esito M0

## Ambiente di esecuzione disponibile in questa sessione

Questo agente costruisce dentro StackSail. La "live preview" e il "sito pubblicato"
eseguono il codice con react-native-web in un browser; non è un simulatore iOS né un
dispositivo fisico, e non c'è accesso shell/Xcode per creare una development build o
installarla su un iPhone reale da questa sessione.

Conseguenza diretta per il piano ATLANTE: i moduli nativi richiesti dalla Release A
(`expo-media-library`, storage nativo SQLite via `expo-sqlite`, `react-native-maps`
con provider Apple Maps, `react-native-view-shot`) NON possono essere eseguiti né
verificati end-to-end da qui. Questo è un limite di piattaforma dell'ambiente di
building, non un difetto risolvibile riscrivendo il codice in altro modo — vale la
regola del piano: "documenta il blocco e prepara il percorso di development build.
Non sostituire la funzionalità con risultati inventati."

## Cosa è stato effettivamente verificato in questa sessione

| Prova richiesta da M0 | Esito | Nota |
|---|---|---|
| `run_build` (sintassi, import, config) | ESEGUITO — vedi TEST_REPORT.md | Non prova comportamento a runtime |
| Rendering schermata diagnostica in preview | ESEGUITO (parziale) | Mostra correttamente gli stati "non disponibile in preview" |
| Richiesta permesso libreria foto reale | NON ESEGUITO | Richiede build nativa |
| Lettura batch reale di asset (`MediaLibrary.getAssetsAsync`) | NON ESEGUITO | Richiede build nativa |
| Foto senza GPS / con GPS / Live Photo / iCloud non disponibile | NON ESEGUITO | Richiede libreria fotografica reale su dispositivo |
| Persistenza SQLite nativa dopo riavvio | NON ESEGUITO | `expo-sqlite` è nativo; su web il fallback usa AsyncStorage (vedi DECISIONS.md) |
| Mappa nativa con marker reali (Apple Maps) | NON ESEGUITO | `react-native-maps` non renderizza in react-native-web |
| Revoca permessi durante scansione | NON ESEGUITO | Richiede dispositivo |

## Cosa è stato costruito comunque, e perché è legittimo

Il codice per ciascuna capacità nativa è stato scritto per intero e verificato per
correttezza sintattica/di import (`run_build`), non per comportamento runtime:

- `lib/photoLibrary/nativeAdapter.ts` — usa la vera API `expo-media-library`
  (`requestPermissionsAsync`, `getAssetsAsync`, `getAssetInfoAsync`), attivo solo
  quando `Platform.OS !== 'web'`. Su web restituisce uno stato esplicito
  `unavailable_in_preview`, mai dati finti. Fix per il bug segnalato via TestFlight
  "tutte le foto risultano senza posizione" — voce datata in `docs/DECISIONS.md`
  ("Sessione successiva — fix build nativa fallita + foto segnalate senza
  posizione"): `getAssetsAsync` non include mai le coordinate GPS (limite noto
  della libreria) — per ogni pagina l'adapter ora chiama `getAssetInfoAsync` per
  singolo asset (con un massimo di 6 chiamate native in parallelo) per leggere
  davvero `location`. Prima di questo fix ogni foto risultava sempre senza
  posizione anche quando l'aveva; ora una foto senza GPS reale (screenshot, foto
  scattata con localizzazione disattivata) resta correttamente senza coordinate, e
  un errore di lettura (es. asset solo iCloud non scaricato) marca quella singola
  foto `metadataStatus: "unavailable"` senza bloccare la scansione delle altre.
  Non ancora verificato su una libreria reale (richiede build nativa, vedi sotto).
  Secondo intervento sullo stesso sintomo (segnalato di nuovo su TestFlight dopo il
  primo fix), tutto in `nativeAdapter.ts` + `lib/photoLibrary/locationExtraction.ts`:
  1. `getAssetInfoAsync` viene ora chiamata con `shouldDownloadFromNetwork: false`
     al primo passaggio. Il default della libreria è `true`: su una libreria reale
     ottimizzata per iCloud questo fa scaricare l'originale di *ogni* foto dalla
     rete, rendendo la scansione lentissima e facendola fallire/andare in timeout —
     e ogni fallimento si traduceva in "foto senza posizione". Le coordinate del
     PHAsset sono leggibili localmente, quindi il download non serve.
  2. Fallback EXIF: se `info.location` è assente si leggono i tag GPS di
     `info.exif` (dizionario `{GPS}` su iOS, chiavi piatte `GPSLatitude` su
     Android), applicando gli emisferi `N/S` ed `E/W`. Serve per foto importate,
     AirDrop o modificate, il cui PHAsset non porta `location`.
  3. Nuovo tentativo mirato con `shouldDownloadFromNetwork: true` solo per gli asset
     ancora su iCloud (`isNetworkAsset`) e solo entro un budget di 12 per pagina,
     così un archivio interamente in cloud non blocca la scansione.
  4. Timeout di 8s per asset: una singola foto bloccata non ferma più l'intera
     pagina.
  5. `cloudAvailability` viene popolato davvero (`local` / `cloud_pending`), e la
     distinzione "senza GPS" vs "metadati non leggibili ora" è mostrata all'utente
     (Mappa e schermata "Senza posizione") invece di essere appiattita su
     "senza posizione".
  6. Cache obsoleta: i metadati salvati dalla versione precedente contengono
     `latitude: null` per tutte le foto. Una versione di pipeline
     (`LOCATION_PIPELINE_VERSION` in `lib/storage.ts`) marca quella cache come non
     affidabile e la Mappa propone una riscansione **esplicita** — nessuna lettura
     automatica della galleria, come da vincoli del piano.
- `lib/db/nativeSqlite.ts` — usa `expo-sqlite` con schema versionato reale
  (`CREATE TABLE IF NOT EXISTS`, transazioni), attivo solo su nativo.
- `components/AppMap.tsx` — su nativo monta `react-native-maps` (Apple Maps) con
  marker a miniatura e cluster; su web disegna una carta con `react-native-svg` e gli
  stessi marker come elementi posizionati, con lo stesso pannello del luogo.
- `screens/DiagnosticScreen.tsx` (schermata interna, non di produzione) — esegue in
  sequenza: richiesta permesso → lettura N asset → estrazione coordinate/orientamento
  → scrittura riga di prova nel repository → lettura di verifica. Su web ogni passo
  che dipende da un modulo nativo si ferma con esito `blocked` esplicito e il motivo;
  su una build nativa reale esegue le operazioni vere e riporta l'esito effettivo
  (nessun passo viene marcato "riuscito" se non ha davvero eseguito la chiamata nativa).

## Percorso per completare la verifica reale (da fare dall'utente/fuori da questa sessione)

1. Collegare un account Expo (Integrazione "Paste an Expo access token") per abilitare
   build native.
2. Generare una development build o una build TestFlight del progetto (Publish).
3. Installarla su un iPhone reale con foto autorizzate in galleria (includere almeno:
   una foto senza GPS, una con GPS, una Live Photo, un asset iCloud non scaricato).
4. Seguire `docs/IPHONE_TEST_CHECKLIST.md` (la §1 è la Diagnostica M0: Impostazioni →
   Diagnostica → "Diagnostica M0 (capacità native)").
5. Riportare l'esito in `docs/TEST_REPORT.md` (sezione "Prove su dispositivo") prima
   di dichiarare M0 `VERIFIED`.

## Aggiornamento 2026-09-29

- Coordinate GPS: confermate funzionanti dall'utente su TestFlight dopo il secondo
  fix (segnalazione, non ancora con i numeri della Diagnostica).
- Moduli nativi aggiunti dopo l'ultima build nota, tutti da provare con una nuova build:
  `expo-task-manager` + `expo-background-fetch` (scansione in background, finestre
  decise da iOS), `react-native-svg`, `expo-linear-gradient`, `expo-haptics`, `expo-blur`.
- `expo-sharing` su iOS non comunica se l'utente ha inviato o annullato: l'app non
  dichiara mai "Condiviso".

Fino a quel momento, lo stato di M0 in `docs/STATUS.md` resta `IMPLEMENTED_UNVERIFIED`
per le parti native, e `VERIFIED` solo per le parti verificabili in questo ambiente
(build/compilazione, rendering degli stati "non disponibile").
