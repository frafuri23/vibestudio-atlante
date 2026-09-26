# TEST_REPORT

## Ambiente

- Agente di building StackSail (nessuna shell, nessun simulatore iOS, nessun
  dispositivo fisico collegato).
- Comando disponibile: `run_build` (controllo sintassi TS/TSX, risoluzione import,
  presenza dipendenze in package.json, validità entry point e config JSON).
- Nessun test runner Jest/E2E installato nello scaffold di partenza; non introdotto
  in questa sessione per non aggiungere infrastruttura non richiesta esplicitamente.

## Comandi eseguiti in questa sessione

| Comando | Esito | Nota |
|---|---|---|
| `run_build` | vedi esito riportato in questa stessa conversazione | Copre sintassi + import di tutti i file scritti |
| `verify_screen` (smoke test navigazione) | vedi esito riportato in questa stessa conversazione | Copre solo interazioni disponibili in react-native-web |
| `look_at_screen` | vedi esito riportato in questa stessa conversazione | Copre solo resa visiva in preview, non comportamento nativo |

Nessun altro comando è stato eseguito. Il controllo build successivo alla modifica del
checkpoint è passato. Non è stato lanciato nulla su un iPhone fisico
o su un simulatore: questa capacità non è disponibile da questa sessione di building.

## Verifica della ripresa scansione

Il percorso è stato validato staticamente con `run_build`: il contratto include
`cursor` e `scanMode`, il fallback web legge anche i record precedenti, e SQLite
migliora lo schema all'avvio senza richiedere una reinstallazione. Non è stato
possibile simulare la terminazione dell'app o iOS/iCloud in questa sessione.
La prova da eseguire su TestFlight è: avviare una scansione reale, chiuderla dopo
almeno una pagina, riaprire, premere la riscansione esplicita e verificare che il
conteggio continui dal checkpoint, che la pagina interrotta possa essere riletta e
che nessun `libraryAssetId` compaia due volte.

## Prove manuali NON eseguite (richiedono dispositivo reale, elencate dal piano §11)

Permessi: negato, limitato, completo, variazione selezione, revoca durante scansione —
NON ESEGUITE.
Libreria: vuota, senza GPS, foto storiche, cambi data/coordinate, cancellazioni —
NON ESEGUITE.
Media: HEIC, JPEG, Live Photo come still, panorama, screenshot, orientamento, iCloud
non disponibile — NON ESEGUITE.
Mappe: filtri, bounds, antimeridiano, coordinata zero, area vuota, punti coincidenti —
NON ESEGUITE su dati reali (la logica di calcolo è coperta da valori di test interni
al codice — vedi `lib/geo/haversine.ts` e `lib/memories/engine.ts` — ma non da un test
runner automatizzato: nessun Jest installato in questa sessione).
Ricordi: ritorni allo stesso luogo, multicittà, merge/split, persistenza override —
NON ESEGUITE su dati reali; il motore è stato eseguito solo sui dati demo interni.
Quiz: pochi dati, date mancanti, asset perso, scoring, ripresa sessione — eseguito solo
sui dati demo tramite l'interfaccia in preview, non con libreria reale.
Export: file reale apribile fuori dall'app, metadati, zone private, share annullata —
NON ESEGUITE (richiede `react-native-view-shot` + `expo-sharing`, nativi).
Accessibilità: VoiceOver, testo dinamico e contrasto — NON ESEGUITE (richiedono
screen reader e impostazioni reali su dispositivo). Riduci movimento è collegato nel
codice sia alla preferenza interna sia a quella del sistema; target tattili e semantica
sono verificabili staticamente, ma il comportamento finale resta da provare su iPhone.
Performance (aggiornamento 2026-09-28): il benchmark 1k/10k/50k ora esiste in
Diagnostica (foto sintetiche in memoria, p50/p95). Build check superato; percorso demo
verificato in preview (demo → Ricordi → Timeline → riavvio con dati presenti). Il
benchmark stesso NON è stato eseguito in questa sessione (strumento di verifica
interattiva esaurito): eseguirlo su iPhone e riportare qui i valori. Memoria — NON
misurata. Stato precedente: NON ESEGUITE (nessun profiler
disponibile in questo ambiente; nessun benchmark automatizzato introdotto).

## Sessione successiva — estensione schema e nuova verifica interattiva

`run_build` eseguito dopo l'estensione dello schema dati (photo_assets, visits/
visit_photos, memory_photos, quiz_sessions/quiz_questions, private_zones,
share_drafts, app_settings) e delle relative schermate (Impostazioni: zone private +
riduci movimento; Gioca: persistenza/ripresa sessione; Dettaglio foto: nome luogo
manuale; Condividi: bozza di condivisione) — ESITO: superato (nessun errore di
sintassi, import, o tipo).

Un tentativo di `verify_screen` (tap "Esplora una demo" → atteso arrivo sulla tab
Mappa) ha fallito due volte di seguito con lo stesso esito della sessione precedente
(il testo "Mappa" non compare entro il timeout); un terzo tentativo con log di debug
temporanei aggiunti al codice non ha prodotto alcuna riga in `get_preview_logs`, e
`look_at_screen` non ha mostrato alcuna schermata di errore — solo l'onboarding
invariato. Il budget del tool di verifica interattiva si è esaurito prima di poter
isolare la causa. NON è stato dichiarato risolto: è stato aggiunto un Error Boundary
di radice (vedi DECISIONS.md) come misura difensiva, e questa verifica resta
NON CONFERMATA — da ripetere alla prossima sessione con il tool disponibile prima di
segnare il flusso onboarding→Mappa `VERIFIED`. I log di debug temporanei sono stati
rimossi dal codice.

## Sessione successiva — secondo fix lettura posizione foto (TestFlight)

`run_build` eseguito dopo le modifiche a `lib/photoLibrary/nativeAdapter.ts`, il nuovo
`lib/photoLibrary/locationExtraction.ts`, `lib/storage.ts`, `lib/appState.tsx`,
`screens/MapScreen.tsx`, `screens/NoLocationScreen.tsx` e
`screens/DiagnosticScreen.tsx` — ESITO: superato (nessun errore di sintassi, import o
tipo).

`verify_screen` (tap "Esplora una demo" → atteso arrivo sulla tab Mappa) ripetuto tre
volte, anche dopo un reload esplicito della preview: il tap viene registrato ma la
schermata resta l'onboarding e `get_preview_logs` non restituisce alcuna riga (nemmeno
un `console.log` temporaneo inserito nel gestore `onPress`, poi rimosso). Esito
INCONCLUSIVO come nelle sessioni precedenti: nessuna prova che il flusso funzioni e
nessuna prova che sia rotto (nessun errore runtime riportato, nessuna schermata di
errore). Resta NON CONFERMATO.

Le correzioni sulla lettura delle coordinate NON sono verificabili qui in alcun modo:
`expo-media-library` non esegue in react-native-web, quindi non esiste una libreria
foto reale da leggere. L'unica verifica valida è quella su dispositivo descritta in
`docs/NATIVE_CAPABILITIES.md` (Impostazioni → Diagnostica M0 su build TestFlight),
che ora riporta, su 25 asset reali: quante foto hanno coordinate reali (con un esempio
numerico), quante hanno metadati non leggibili e quante sono ancora solo su iCloud.

## Nota sulla verifica interattiva in questa sessione

Durante questa sessione è stato eseguito un controllo visivo (screenshot reale della
preview) sulla schermata di onboarding: layout corretto, nessun elemento tagliato,
pulsanti e testo leggibili. Un tentativo di test interattivo end-to-end (tap su
"Esplora una demo" → atteso arrivo sulla tab Mappa) ha inizialmente fallito: il
passaggio da onboarding a Mappa non avveniva nel tempo di attesa del tool. Analizzando
il codice è stata individuata una causa plausibile — `startDemo`/`requestRealAccess`
attendevano il completamento dell'intera scansione prima di segnare l'onboarding come
concluso; se la scansione (o una delle chiamate `AsyncStorage` al suo interno) avesse
incontrato un problema, `completeOnboarding()` non veniva mai chiamato. È stato
corretto: ora la scansione parte in background (senza bloccare l'onboarding) ed è
avvolta in un proprio try/catch che riporta un errore esplicito nello stato invece di
propagarlo. Sono stati inoltre resi "lazy" gli import dei moduli nativi
(`expo-media-library`, `expo-sqlite`) così da non essere valutati affatto lato web.
Il tool di verifica interattiva non era più disponibile nel resto della sessione per
confermare la correzione con un nuovo tap reale: questo è registrato qui come
verifica NON ripetuta, non come "risolto e confermato". Va ripetuta alla prossima
sessione prima di dichiarare il flusso demo `VERIFIED`.

## Hardening checkpoint — verifica statica

Sono stati verificati staticamente i casi che avevano rischio di stato incoerente:
- il checkpoint viene adottato solo se `scanMode` coincide con la modalità attiva;
- i record AsyncStorage precedenti vengono letti con valori predefiniti sicuri;
- una scansione reale incompleta non può dichiarare aggiornata la pipeline GPS;
- la sostituzione degli asset resta limitata alla scansione completata e alla relativa modalità.

Questi controlli non sostituiscono la prova di terminazione e riapertura su iPhone: la verifica nativa resta elencata sotto le prove non eseguite.

## M6 — verifica statica accessibilità e movimento

Il codice ora centralizza la preferenza in `lib/useReduceMotion.ts`: con override nullo
segue `AccessibilityInfo.isReduceMotionEnabled()`, mentre un override esplicito prevale.
Le due animazioni core presenti (onboarding e barra risultato quiz) vengono saltate e
portate direttamente allo stato finale quando la riduzione è attiva. I controlli
interattivi trovati sotto 44 pt (azione banner permesso, riscansione, filtri anno,
segmenti aspetto e azioni luogo) sono stati portati alla soglia minima. Sono state
aggiunte etichette/hint e stati accessibili a filtri, foto, quiz, switch e progressbar.
Questa è una verifica del codice, non una prova VoiceOver su hardware.

## Sessione 2026-09-29 — riallineamento documenti

- `docs/STATUS.md` riscritto sullo stato reale del codice (nomi luoghi offline,
  background, ottimizzazioni, tab bar di vetro erano descritti come assenti).
- Nuovo `docs/IPHONE_TEST_CHECKLIST.md`: 11 sezioni con azione ed esito atteso.
- Difetto trovato rileggendo il codice: su iOS `Sharing.shareAsync` si risolve anche
  quando il foglio di condivisione viene chiuso senza inviare, quindi l'app mostrava
  "Condiviso." anche dopo un annullamento. Corretto in `screens/ShareCardScreen.tsx`:
  ora dice solo che la card è stata creata e che iOS non comunica l'esito.
- Diagnostica passo 6 (mappa): non riporta più "ok" su nativo, perché montare il
  modulo non prova che la mappa si veda.
- Eseguito: `run_build`. Non eseguito: nessuna prova su dispositivo.

## Prove su dispositivo (da compilare)

Build: ______  iOS: ______  Modello: ______  Foto in Galleria: ______  Data: ______

| Sezione checklist | Esito | Note |
|---|---|---|
| 1 Diagnostica M0 | | X/25 con GPS: __ · illeggibili: __ · iCloud: __ · motore: __ |
| 2 Permessi | | |
| 3 Ripresa primo piano | | |
| 4 Background | | contatore prima/dopo: __ / __ |
| 5 Mappa | | |
| 6 Ricordi/timeline/passaporto | | |
| 7 Quiz | | |
| 8 Card condivisibile | | |
| 9 Accessibilità | | |
| 10 Prestazioni | | 10k: __ · 50k: __ · avvio reale: __ s |
| 11 Resilienza | | |

Già noto da segnalazione utente (TestFlight, prima della checklist): coordinate GPS
lette correttamente dopo il secondo fix della pipeline di posizione.

## Regola applicata

Nessuna delle prove sopra elencate come "NON ESEGUITA" è stata riportata come superata
altrove nella documentazione o nel codice (nessun badge "verificato", nessun testo
UI che dichiari un permesso concesso, una foto importata o una condivisione avvenuta
senza che l'operazione nativa corrispondente sia realmente stata eseguita).
Compilazione riuscita (`run_build`) NON equivale a verifica funzionale: è trattata
come tale in `docs/STATUS.md`.
