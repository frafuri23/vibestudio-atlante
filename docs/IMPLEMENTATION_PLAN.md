# ATLANTE — Piano di implementazione

Questo file conserva la specifica fornita dall'utente (versione 1.0, 21 settembre 2026),
usata come riferimento per tutte le milestone M0–M8. Il testo integrale originale
(`PIANO_IMPLEMENTAZIONE_STACKSAIL_ATLANTE.md`, allegato dall'utente) resta la fonte
autorevole; questo file ne conserva un riassunto operativo aggiornato ad ogni milestone.

## Vincoli non negoziabili (validi per tutte le milestone)

- Nessun backend, account, pagamento o API AI nella Release A (M0–M6).
- Nessun tracciamento della posizione corrente del dispositivo: si leggono solo le
  coordinate eventualmente già presenti nei metadati delle foto.
- Nessun caricamento automatico della galleria verso un server.
- Nessuna modifica o cancellazione delle foto originali nella libreria di sistema.
- Permessi negati/limitati/revocati gestiti esplicitamente, non ignorati.
- Modalità demo separata dai dati reali, sempre etichettata come tale.
- Nessun pulsante può simulare un'operazione riuscita che non è realmente avvenuta.

## Ambiente StackSail — vincolo strutturale scoperto in M0

Il runtime "live preview" e il sito pubblicato di StackSail eseguono l'app con
react-native-web in un browser. `expo-media-library`, `expo-sqlite` (storage nativo),
e `react-native-maps` sono moduli nativi: NON funzionano in quell'ambiente (nessun
crash, ma nessun effetto reale —ès. permesso sempre "non disponibile", nessuna query
SQLite nativa). Funzionano soltanto in una build nativa reale (development build o
TestFlight). Questo non è un difetto del codice: è documentato in
`docs/NATIVE_CAPABILITIES.md` con le prove eseguite e va rispettato da qualunque
sviluppo futuro — non sostituire con dati inventati nella preview, mostrare invece
uno stato "Richiede build nativa".

## Roadmap eseguita in questa sessione

- **M0 — Audit e prova nativa minima**: eseguito. Vedi `docs/NATIVE_CAPABILITIES.md`
  e `docs/TEST_REPORT.md`.
- **M1 — Permessi, database e indicizzazione progressiva**: infrastruttura
  implementata (adapter, repository SQLite reale su nativo, macchina a stati di
  scansione, gestione permessi/revoca). Non verificabile end-to-end su dispositivo
  da questo ambiente: stato `IMPLEMENTED_UNVERIFIED`.
- **M2–M5**: schermate costruite con la stessa architettura a contratti (MapQueryService,
  MemoryEngine, QuizEngine, ShareSanitizer) così che, una volta collegato l'adapter
  nativo reale su un dispositivo, il percorso funzioni senza riscritture. In preview
  girano sui dati demo dichiarati. Non sono stati implementati clustering avanzato su
  50k foto, geocoding di rete o esportazione video: fuori scope di questa sessione.
- **M6, M7, M8**: non avviati. M7/M8 richiedono un backend Supabase esplicitamente
  autorizzato dall'utente (non richiesto in questa sessione).

Per il testo completo delle 8 milestone, dei contratti applicativi, del modello dati
e dei criteri di uscita, fare riferimento al documento allegato dall'utente in chat
(`PIANO_IMPLEMENTAZIONE_STACKSAIL_ATLANTE.md`), che rimane la specifica di riferimento.
