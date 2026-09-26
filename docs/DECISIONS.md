# DECISIONS

Formato: data · decisione · motivazione.

## 2026-09-29 — Nessun "Condiviso" dopo il foglio di condivisione

Su iOS `Sharing.shareAsync` (expo-sharing) si risolve quando il foglio viene chiuso,
senza dire se l'utente ha inviato o annullato. Mostrare "Condiviso." violava il vincolo
"nessun pulsante simula un'operazione riuscita". Ora, dopo la chiusura del foglio,
l'app dice solo che la card è stata creata come immagine e che iOS non comunica
l'esito. La bozza passa ad "approved" quando l'utente preme Condividi e il file PNG
esiste davvero: registra l'approvazione di quella revisione, non la ricezione.
Il passo 6 della Diagnostica (mappa) non riporta più "ok": montare il modulo non
prova che la mappa si veda. Prove su iPhone raccolte in `docs/IPHONE_TEST_CHECKLIST.md`.

## 2026-09-28 — Prestazioni per librerie grandi (10k–50k foto)

Scelta dell'utente: partire dalle prestazioni. Punti critici trovati leggendo il codice
e decisioni:
- **Mappa**: il raggruppamento lavorava su tutte le foto del mondo anche da zoomati su
  una città, e sul telefono ogni gruppo è un marker nativo con immagine. Ora
  `clusterForRegion` considera solo l'area visibile + 60% di margine per lato ed è
  limitato a 250 marker (vincono i gruppi più grandi). L'ordinamento "più recente
  prima" avviene una volta per dataset (`sortNewestFirst` in `AppMap`), non per ogni
  gruppo a ogni pan/zoom. `fitRegion` e `PlaceSheet` non usano più
  `Math.min(...array)`, che con decine di migliaia di valori supera lo stack.
- **Scansione**: ogni pagina da 100 ricostruiva e reinviava alla UI l'intera lista,
  facendo ricalcolare mappa, timeline e contatori (lavoro quadratico). Ora la lista
  viaggia al massimo ogni 1,5 s (`photoEmitIntervalMs`), l'avanzamento resta a ogni
  pagina. A fine scansione si cancellano solo le righe con `scan_generation` inferiore
  all'inizio dell'enumerazione (`pruneStalePhotoAssets`) invece di riscrivere tutta
  la tabella; i checkpoint legacy senza `startGeneration` usano ancora la sostituzione
  completa. Durante la scansione la mappa non si reinquadra più a ogni aggiornamento.
- **SQLite**: `journal_mode = WAL` + `synchronous = NORMAL`; scritture in blocco con
  istruzioni preparate una sola volta (`withStatement`); ricordi e visite salvati in
  una sola transazione (`replaceSuggestions`), che rimuove anche i suggerimenti mai
  toccati dall'utente e non più prodotti (confermati, scartati e modificati restano);
  `listVisits` passa da una query per visita a due query.
- **Calcoli**: nomi dei mesi senza Intl (lento su Hermes) in timeline e titoli dei
  ricordi; lookup con Map/Set nel motore dei ricordi e in MemoryDetail; quiz con
  Fisher-Yates parziale invece di ordinare tutto il pool con un comparatore casuale.
- **Misura**: `lib/perf/benchmark.ts` + sezione in Diagnostica. Usa foto SINTETICHE
  generate in memoria (mai salvate né mostrate come foto dell'utente) per misurare gli
  algoritmi, e una lettura reale in sola lettura della cache locale per la query di
  avvio. Non sostituisce Instruments per la memoria.
Tutto JavaScript: arriva con un aggiornamento istantaneo sulle build che hanno già i
moduli nativi richiesti. Nessuna verifica su dispositivo ancora.

## 2026-09-24 — Scansione in background gestita da iOS (richiede nuova build)

Richiesta dell'utente: far proseguire la scansione anche quando l'app non è aperta.
Decisioni:
- `expo-task-manager` + `expo-background-fetch` (SDK 52), `UIBackgroundModes: ["fetch"]`
  in `app.json`. Sono moduli nativi: serve una **nuova build**, un aggiornamento OTA
  non li porta sui telefoni già installati.
- `lib/indexing/backgroundScan.ts`: il task è definito a livello di modulo (`App.tsx`),
  perché iOS può avviare l'app in background senza montare componenti. Ogni risveglio
  esegue una "fetta" limitata: pagine da 25 foto, stop a 20 s (iOS concede ~30 s),
  checkpoint dopo ogni pagina. Il coordinator ha la nuova opzione `shouldYield` che
  ferma la corsa lasciando la fase `scanning` (resta riprendibile).
- Il task NON avvia mai una nuova lettura della galleria: lavora solo se il job su disco
  è una scansione reale in fase `scanning` (avviata dall'utente, non in pausa) e se il
  permesso è ancora concesso. Rispetta quindi il vincolo "nessun caricamento automatico".
- `lib/indexing/scanLock.ts` (`runExclusive`): scansione in primo piano e fetta di
  background non si sovrappongono mai sullo stesso database.
- Al ritorno in primo piano l'app ricarica checkpoint, foto e ricordi scritti in
  background e prosegue una scansione ancora `scanning`.
- La card di avanzamento dice se iOS consentirà la prosecuzione in background o se
  "Aggiorna app in background" è disattivato (serve tenere l'app aperta).
- Limiti reali: iOS decide quando risvegliare l'app (di solito ogni 15+ minuti, più
  spesso in carica e su Wi‑Fi, mai garantito); se l'utente chiude l'app dal selettore
  multitasking iOS non la risveglia più fino alla riapertura; in Risparmio energetico
  il background refresh è sospeso.

## 2026-09-23 — La scansione non riparte da zero dopo riavvio / aggiornamento OTA

Sintomo segnalato: dopo un OTA o un riavvio il caricamento delle foto ricominciava da
capo. Cause trovate nel codice:
1. Al riavvio lo stato `scanning` salvato non veniva mai riconosciuto come interrotto:
   la UI mostrava "in corso" per sempre, il pulsante "Riscansiona" restava disabilitato
   e nessuno riprendeva il lavoro.
2. Ogni pagina riscriveva nella cache TUTTE le foto raccolte fin lì, una INSERT per
   volta senza transazione: lavoro quadratico, pagine sempre più lente, checkpoint
   sempre più radi.
3. Una nuova scansione rileggeva `getAssetInfoAsync` per ogni foto già nota e la mappa
   mostrava solo le foto riviste fin lì, sembrando svuotata.
4. Con permesso momentaneamente "sconosciuto" il cursore veniva azzerato.
5. La lettura della cache all'avvio aveva un timeout di 4s: su librerie grandi l'app
   poteva aprirsi vuota.

Decisioni:
- `Repository.commitScanPage` scrive righe della pagina + checkpoint in un'unica
  transazione SQLite; batch in transazione anche per `cachePhotoAssets`/`replacePhotoAssets`.
- `IndexJobStatus.startGeneration` (colonna `start_generation`, migrazione ALTER)
  identifica l'enumerazione in corso attraverso i resume: alla ripresa si tengono solo
  le righe già confermate da quell'enumerazione, così le cancellazioni vengono ancora
  rilevate a fine scansione.
- Riuso dei metadati: un asset già letto dalla pipeline GPS corrente e con la stessa
  `modificationTime` non viene riletto (disattivato se la cache è di una pipeline vecchia).
- Durante una riscansione la mappa continua a mostrare i risultati precedenti.
- Pagina reale da 100 foto (prima 150): al massimo una pagina persa per interruzione.
- **Ripresa automatica solo di una scansione interrotta**: se all'avvio il job su disco è
  ancora `scanning` (processo terminato a metà), l'app la continua dal cursore, solo con
  permesso ancora concesso. Non è un nuovo caricamento automatico della galleria: completa
  un'enumerazione avviata esplicitamente dall'utente. Una scansione messa in pausa dall'utente
  NON riparte da sola: la Mappa mostra "Scansione in pausa · Riprendi".
- Una scansione `completed` riparte comunque dalla prima pagina (serve per aggiunte e
  cancellazioni), ma grazie al riuso è rapida e non tocca di nuovo il GPS delle foto invariate.

## 2026-09-22 — Ricontrollo permessi al ritorno in primo piano

In modalità reale, quando l'app torna attiva viene chiamato solo `getPermission()`.
Se il permesso è stato revocato o è diventato sconosciuto, la scansione corrente viene
annullata e lo stato persistito passa a `awaiting_permission`, mantenendo la cache locale.
Non viene letto alcun asset e non parte una scansione automatica: l'utente deve
riaprire l'accesso e premere esplicitamente l'azione di scansione. Questo gestisce la
revoca da Impostazioni senza violare il vincolo di nessun caricamento automatico della
galleria.

## 2026-09-22 — Hardening del resume e della pipeline GPS

Il job persistito viene adottato solo quando `scanMode` coincide con la modalità attiva, così demo e libreria reale non mostrano reciprocamente stato o progresso. Il fallback web normalizza anche record creati dalle versioni precedenti senza cursor o permesso osservato. Una nuova scansione annulla quella precedente; la pipeline GPS viene marcata aggiornata solo dopo una scansione reale completata. Errori, annullamenti, timeout e indisponibilità mantengono invece l'avviso e il checkpoint da cui ripartire.

## 2026-09-22 — Checkpoint di scansione persistito

La ripresa dopo chiusura usa il `cursor` restituito dall'adapter e lo salva nel
repository solo dopo aver scritto la pagina nella cache. `IndexJobStatus` include
anche `scanMode`, così demo e libreria reale non possono condividere accidentalmente
un checkpoint. Le scansioni interrotte riprendono dall'ultima pagina completa; quelle
concluse ripartono dall'inizio per poter rilevare aggiunte, modifiche e cancellazioni.
La deduplica usa l'id stabile dell'asset. In SQLite la migrazione aggiunge le colonne
in modo compatibile alle installazioni già esistenti; sul web il fallback normalizza
le vecchie righe AsyncStorage.

## 2026-09-21 — Stack confermato
Expo SDK 52 / React Native 0.76.5 / TypeScript, progetto react-native-web-compatibile
già presente come scaffold vuoto (nessun router, nessuna schermata reale). Nessuna
migrazione di versione: si costruisce sopra lo scaffold esistente.

## 2026-09-21 — Navigazione
Nessun router preesistente. Scelto `@react-navigation` (native-stack + bottom-tabs),
come da regola di progetto StackSail (mai expo-router: l'entry point è `App.tsx`).
Tre tab Release A: Mappa, Ricordi, Gioca. Impostazioni raggiunta da icona in header,
non da tab, per restare a 3 tab come da piano.

## 2026-09-21 — Persistenza: adapter di storage doppio (nativo + web)
Il piano prescrive `expo-sqlite`. `expo-sqlite` è un modulo nativo: nella live preview
StackSail (react-native-web) non esegue query reali. Poiché il target dichiarato di
questo progetto è "universale" (iOS e web entrambi di primo livello) e la preview deve
comunque mostrare un'app funzionante, è stato introdotto `PhotoIndexStorage`
(interfaccia unica in `lib/db/repository.ts`) con due implementazioni:
- `nativeSqliteStorage` (expo-sqlite reale, transazioni, schema versionato) — attiva
  solo quando `Platform.OS !== 'web'`, cioè in build nativa.
- `webFallbackStorage` (AsyncStorage con lo stesso contratto CRUD) — attiva su web,
  usata anche per la modalità demo su qualunque piattaforma.
Questo NON sostituisce la prova nativa richiesta dal piano: la persistenza SQLite vera
resta verificabile solo su build nativa/TestFlight (vedi NATIVE_CAPABILITIES.md). È un
adapter di compatibilità dichiarato, non un dato inventato.

## 2026-09-21 — Modalità demo esplicita
`app_settings.mode` è `'demo' | 'real'`. In modalità demo il `PhotoLibraryAdapter` usa
`lib/fixtures/demoPhotos.ts` (dati sintetici, mai foto reali dell'utente) e ogni
schermata mostra un badge "Demo". In modalità reale l'adapter chiama
`expo-media-library`; su web/preview questo adapter reale restituisce esplicitamente
`unavailable` (nessun dato finto), mostrato come stato "Richiede build nativa".

## 2026-09-21 — Milestone eseguite in questa sessione
M0 completato (vedi TEST_REPORT.md). M1 implementato ma non verificato su dispositivo
(dipendenza nativa non testabile da questo ambiente). M2–M5: schermate e motori
(MapQueryService, MemoryEngine, QuizEngine, ShareSanitizer) implementati e funzionanti
sui dati demo; non verificati su libreria reale/dispositivo grande. M6/M7/M8 non avviati.

## Sessione successiva — schema dati completato secondo il piano §3
Lo schema iniziale copriva solo un sottoinsieme (`photo_overrides`, `places`,
`memories`, `index_jobs`) tenuto deliberatamente minimo per M0/M1. In questa sessione
è stato esteso a tutte le entità del piano: `photo_assets` (cache di sole metadati
del risultato di scansione — non duplica né mai scarica byte immagine, permette di
mostrare l'ultimo risultato dopo un riavvio senza un nuovo accesso alla libreria),
`visits`/`visit_photos` (le "visite" brevi calcolate dal motore dei ricordi, ora
persistite separatamente dai capitoli), `memory_photos` (relazione ordinata
esplicita, in aggiunta alla colonna `photo_ids` già presente), `quiz_sessions`/
`quiz_questions` (sessioni quiz riprendibili dopo un riavvio), `private_zones`
(spostate da AsyncStorage al Repository, con una UI di gestione reale in
Impostazioni — prima non esisteva alcuna UI per crearle), `share_drafts` (traccia
bozza → approvata solo dopo una condivisione riuscita), `app_settings` (riduci
movimento + lingua + demo). Implementate identicamente in `lib/db/nativeSqlite.ts`
(SQLite reale) e `lib/db/webFallback.ts` (stesso contratto via AsyncStorage), come da
decisione già presa sull'adapter doppio. `IndexJobStatus` ha ora anche
`observedPermission` ("permessi osservati", richiesto dal piano). Motivazione: i
requisiti di questa sessione elencano esplicitamente ogni tabella del piano §3; la
regola "non implementare tutte le milestone insieme" riguarda le FUNZIONALITÀ
(M2–M8), non lo schema di persistenza di base che M1 già possiede — estendere lo
schema non introduce funzionalità di milestone successive non richieste, resta
tutto dentro Release A (M0–M6).

## Sessione successiva — fix build nativa fallita + foto segnalate senza posizione
Due problemi riportati dall'utente in questa sessione:
1. Build Expo fallita: `package.json` fissava a `"latest"` diverse dipendenze native
   (`expo-media-library`, `expo-sqlite`, `react-native-maps`, `expo-image`,
   `expo-sharing`, `react-native-view-shot`, i pacchetti `@react-navigation`,
   `react-native-screens`, `react-native-safe-area-context`,
   `@react-native-async-storage/async-storage`), che poteva risolvere versioni più
   recenti di quelle compatibili con Expo SDK 52 / RN 0.76.5 installato — causa
   tipica di fallimento in fase nativa. Fix: pinnate tutte alla versione esatta
   compatibile con l'SDK del progetto. Aggiunto anche il plugin di configurazione
   `expo-media-library` (con le stringhe di permesso richieste da iOS) in
   `app.json`, che mancava.
2. App installata via TestFlight: tutte le foto risultavano senza posizione anche
   quando ne avevano una. Causa reale trovata leggendo `lib/photoLibrary/
   nativeAdapter.ts`: `MediaLibrary.getAssetsAsync` (la chiamata di lista) non
   include mai le coordinate GPS — vanno lette separatamente con
   `MediaLibrary.getAssetInfoAsync` per singolo asset, chiamata che non era mai
   stata scritta né nell'adapter né nel coordinator. Fix: `getPage` ora chiama
   `getAssetInfoAsync` per ogni asset della pagina (con un limite di 6 chiamate
   concorrenti per non sovraccaricare il sistema su librerie grandi) e popola
   `latitude`/`longitude` con il dato reale. Una foto senza GPS reale (screenshot,
   localizzazione disattivata allo scatto) continua correttamente a risultare senza
   posizione; un errore di lettura per singolo asset (es. asset iCloud non ancora
   scaricato) marca solo quella foto `metadataStatus: "unavailable"` senza bloccare
   la scansione delle altre. Non ancora verificato su una libreria reale — richiede
   build nativa (vedi NATIVE_CAPABILITIES.md).

## Sessione successiva — secondo fix "tutte le foto senza posizione" (TestFlight)
Il sintomo è stato segnalato di nuovo dopo il primo fix. Analisi del percorso reale
su dispositivo (la preview web non esegue `expo-media-library`, quindi l'analisi è
sul codice + comportamento documentato della libreria), con quattro cause residue
tutte plausibili su una libreria iPhone vera:
1. **Download da iCloud per ogni asset.** `getAssetInfoAsync` ha
   `shouldDownloadFromNetwork: true` come default: su una libreria "Ottimizza spazio
   iPhone" ogni chiamata poteva tentare il download dell'originale. Su migliaia di
   foto questo rende la scansione impraticabile e fa fallire/andare in timeout le
   letture — e ogni fallimento veniva riportato come "nessuna posizione". Ora il
   primo passaggio usa `shouldDownloadFromNetwork: false` (le coordinate del PHAsset
   sono leggibili in locale) con un timeout di 8s per asset, e solo gli asset
   `isNetworkAsset` senza coordinate ottengono un secondo tentativo con rete, entro
   un budget di 12 per pagina.
2. **Solo `info.location`, nessun fallback EXIF.** Le foto importate/AirDrop/
   modificate spesso non hanno `location` sul PHAsset ma conservano i tag GPS EXIF.
   Nuovo modulo puro `lib/photoLibrary/locationExtraction.ts`: legge prima
   `info.location`, poi `info.exif` (dizionario iOS `{GPS}` e chiavi piatte Android),
   applicando gli emisferi `N/S`–`E/W` e scartando `0/0` (sentinella di GPS assente)
   e valori fuori range.
3. **Cache persistita dalla versione rotta.** `photo_assets` conteneva già
   `latitude: null` per tutte le foto, e all'avvio viene ripristinata senza
   riscansione (vincolo: nessun accesso automatico alla galleria). Introdotta
   `LOCATION_PIPELINE_VERSION` (`lib/storage.ts`, v2): se la cache è stata scritta
   da una versione precedente della pipeline di lettura posizione, la Mappa mostra
   un avviso "Posizioni da ricontrollare" con un pulsante di riscansione
   **esplicito**, invece di mostrare per sempre il vecchio risultato sbagliato.
4. **Diagnosi impossibile per l'utente.** "Senza posizione" appiattiva due casi
   diversi. Ora `metadataStatus: "unavailable"` (metadati non leggibili ora, es.
   originale ancora solo su iCloud) e `cloudAvailability` sono popolati davvero e
   mostrati in Mappa e in "Senza posizione"; la Diagnostica M0 riporta su 25 asset
   quanti hanno coordinate reali (con un esempio numerico), quanti hanno metadati
   illeggibili e quanti sono ancora in cloud.
Nessuna di queste correzioni è verificabile in questo ambiente (nessun modulo nativo,
nessuna libreria foto reale): resta `IMPLEMENTED_UNVERIFIED` fino alla prova su
dispositivo descritta in NATIVE_CAPABILITIES.md.

## Sessione successiva — restyle "Apple" + modalità scura completa
Richiesta esplicita dell'utente ("la grafica è banale e brutta, dovrebbe essere in
stile Apple") con scelta: restyle + dark mode, nessuna nuova funzionalità.
Decisioni prese:
1. **Doppia palette in `lib/theme.ts`.** `lightColors` e `darkColors` hanno chiavi
   identiche (tipo `Palette`), quindi nessuna schermata deve ramificare sullo schema.
   Dark mode segue le convenzioni iOS: fondo nero puro, superfici `#1C1C1E` /
   `#2C2C2E` (l'elevazione in scuro è una SUPERFICIE più chiara, non un'ombra, che
   sul nero sarebbe invisibile), accento schiarito a `#4FB0E8` per il contrasto.
2. **`lib/themeContext.tsx`** (`ThemeProvider` + `useTheme`): preferenza
   `system | light | dark` persistita in AsyncStorage (`atlante.themePreference`),
   default `system` via `useColorScheme()`. Controllo segmentato in Impostazioni →
   Aspetto. Gli stili di ogni schermata sono ora `makeStyles(colors)` memoizzati, non
   più `StyleSheet.create` a livello di modulo (che congelerebbe i colori al primo
   import). `Section`/`InfoRow`/`Row` restano dichiarati a livello di modulo con gli
   stili passati come prop: definirli dentro il componente li rimonterebbe a ogni
   render, facendo perdere il focus ai `TextInput` del form zone private.
3. **Scala tipografica iOS** (largeTitle 34/41 · title1 28 · title2 22 · title3 20 ·
   headline 17/600 · body 17/400 · subhead 15 · footnote 13 · caption 12 · tabLabel
   11) con `fontFamily` = SF di sistema su iOS e stack di sistema equivalente su web.
   Mantenuti gli alias legacy (`display`, `title`, `heading`, `bodyMedium`) per non
   perdere stili in punti non ancora migrati.
4. **Niente bordi attorno alle card.** Sostituiti da superficie + ombra morbida
   (chiaro) o superficie elevata (scuro); i bordi restano solo come separatori
   hairline (`hairline` = 0.5 su nativo, 1 su web) dentro i gruppi in stile lista iOS.
5. **Header.** Le schermate spinte usano la barra di navigazione nativa con
   `headerLargeTitle` su iOS (Impostazioni, Diagnostica, Passaporto, Senza
   posizione), e i loro titoli disegnati a mano sono stati RIMOSSI: erano duplicati
   del titolo dell'header. Corretto anche il doppio inset verticale: quelle schermate
   sommavano `insets.top` a un header che già insetta. I tre tab root continuano a
   disegnare un large title custom (`components/ScreenHeader.tsx`) perché hanno
   layout a schermo fisso (la mappa) dove un header nativo collassabile non avrebbe
   nulla da collassare.
6. **Bug trovato durante il restyle:** il pulsante Impostazioni viveva in
   `screenOptions.headerRight` del tab navigator, ma tutti e tre i tab impostavano
   `headerShown: false` — quindi Impostazioni era IRRAGGIUNGIBILE dalla UI. Ora è
   `components/SettingsButton.tsx`, presente nell'header di tutti e tre i tab.
7. **Nessuna nuova dipendenza nativa.** Niente `expo-blur` (tab bar in vetro) né
   `expo-haptics` (feedback tattile) né `expo-linear-gradient`: la build nativa è
   appena stata riparata e ogni modulo nativo in più richiede un nuovo build e può
   rompere l'autolinking. Gli effetti sono ottenuti con mezzi già disponibili
   (scrim in `rgba`, tab bar solida coerente con il tema, `Animated` di core RN).
   Da riconsiderare esplicitamente quando si pianifica il prossimo build nativo.
8. **Tap target.** Corretto il problema noto dei tocchi sotto i 44pt: chip degli anni
   (36pt di altezza + area estesa), azioni inline di Mappa/Quiz, riga elimina zona,
   pulsanti Impostazioni — ora tutti ≥ 44pt o con `hitSlop`.

## Verifica interattiva non confermata in questa sessione
Un tentativo di test end-to-end (tap "Esplora una demo" → atteso arrivo su Mappa) non
ha superato la verifica automatica; né i log né uno screenshot hanno mostrato un
errore visibile (nessuna schermata rossa, nessun log catturato). È stato aggiunto un
Error Boundary a livello di radice (`App.tsx`, `RootErrorBoundary`) che rende
visibile qualunque crash di rendering futuro invece di lasciare la UI bloccata in
silenzio, così un problema reale sarà distinguibile da un semplice ritardo del tool
di verifica. Il budget del tool di verifica interattiva si è esaurito in questa
sessione prima di poter confermare la causa. Da ripetere alla prossima sessione prima
di dichiarare il flusso onboarding→Mappa `VERIFIED` — vedi TEST_REPORT.md.
