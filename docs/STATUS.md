# STATUS

Stati ammessi: TODO, IN_PROGRESS, IMPLEMENTED_UNVERIFIED, VERIFIED, BLOCKED.
Ultimo riallineamento con il codice: 2026-09-29.

Regola: `VERIFIED` solo per ciò che è stato osservato davvero (preview, oppure
segnalato dall'utente su TestFlight). Tutto il resto nativo resta
`IMPLEMENTED_UNVERIFIED` finché non viene eseguita la lista
`docs/IPHONE_TEST_CHECKLIST.md` e l'esito riportato in `docs/TEST_REPORT.md`.

## Riepilogo

| Milestone | Stato | Cosa manca |
|---|---|---|
| M0 Audit e prova nativa | IMPLEMENTED_UNVERIFIED (parte nativa) | Diagnostica eseguita su iPhone (checklist §1) |
| M1 Permessi, DB, indicizzazione | IMPLEMENTED_UNVERIFIED | Matrice permessi, ripresa, background (checklist §2–§4) |
| M2 Mappa | IMPLEMENTED_UNVERIFIED (nativo) / VERIFIED (preview demo) | Mappa Apple reale (checklist §5) |
| M3 Ricordi, timeline, passaporto | IMPLEMENTED_UNVERIFIED (libreria reale) / VERIFIED (preview demo) | Viaggi reali (checklist §6) |
| M4 Quiz | IMPLEMENTED_UNVERIFIED (libreria reale) / VERIFIED (preview demo, apertura modalità) | Checklist §7 |
| M5 Card condivisibili | IMPLEMENTED_UNVERIFIED | File reale, metadati, annullamento (checklist §8) |
| M6 Rifinitura | IMPLEMENTED_UNVERIFIED | Accessibilità reale e benchmark (checklist §9–§10) |
| M7, M8 | TODO, non avviati | Richiedono backend e account: decisione esplicita |

## M0 — Audit e prova nativa minima

| Task | Stato | Note |
|---|---|---|
| Audit repository / config | VERIFIED | Expo SDK 52, RN 0.76, React Navigation (no expo-router) |
| Documentazione | VERIFIED | IMPLEMENTATION_PLAN, STATUS, DECISIONS, NATIVE_CAPABILITIES, TEST_REPORT, IPHONE_TEST_CHECKLIST |
| Diagnostica interna | IMPLEMENTED_UNVERIFIED | Impostazioni → Diagnostica → "Diagnostica M0 (capacità native)". Il passo "mappa" non dichiara mai successo: la resa va controllata a vista |
| Permesso + lettura batch reale | IMPLEMENTED_UNVERIFIED | Funziona su TestFlight secondo l'utente; esito Diagnostica non ancora riportato |
| Coordinate GPS reali | VERIFIED (segnalazione utente, TestFlight) | Dopo il secondo fix l'utente ha confermato "ora funziona". Mancano numeri (quante con GPS / illeggibili / iCloud) |
| SQLite nativo dopo riavvio | IMPLEMENTED_UNVERIFIED | Migrazione colonne mancanti aggiunta 2026-09-24; fallback web VERIFIED in preview |
| Mappa nativa con marker | IMPLEMENTED_UNVERIFIED | Richiede la build con react-native-svg / expo-blur |

## M1 — Permessi, database, indicizzazione progressiva

| Task | Stato | Note |
|---|---|---|
| PhotoLibraryAdapter nativo/demo/web | IMPLEMENTED_UNVERIFIED | Web: stato esplicito "richiede build nativa", mai dati finti |
| Lettura GPS per asset + EXIF + iCloud | IMPLEMENTED_UNVERIFIED | `shouldDownloadFromNetwork:false`, timeout 8 s, retry mirato 12/pagina, `metadataStatus: "unavailable"` |
| Checkpoint atomico (pagina + cursore) | IMPLEMENTED_UNVERIFIED | Una transazione SQLite per pagina |
| Ripresa dopo chiusura / OTA | IMPLEMENTED_UNVERIFIED | Solo scansioni avviate dall'utente e non in pausa, solo con permesso concesso |
| Scansione in background (BackgroundFetch) | IMPLEMENTED_UNVERIFIED | Blocchi da 25, 20 s per risveglio, lock con il primo piano. Richiede nuova build |
| Ricontrollo permesso al ritorno in primo piano | IMPLEMENTED_UNVERIFIED | Revoca → `awaiting_permission`, cache mantenuta |
| Riscansione incrementale (riuso GPS, pulizia per generazione) | IMPLEMENTED_UNVERIFIED | |
| Separazione demo / reale | VERIFIED | Preview: percorsi e checkpoint distinti, badge "Demo" |

## M2–M5 — Funzioni

| Task | Stato | Note |
|---|---|---|
| Mappa a tutto schermo, marker a miniatura, cluster che si dividono | VERIFIED (preview) / IMPLEMENTED_UNVERIFIED (Apple Maps) | Web: carta svg con gli stessi marker |
| Pannello luogo, filtro anni, "senza posizione" | VERIFIED (preview) | |
| Nomi luoghi offline (~180 città, raggio 45 km) | VERIFIED (preview demo) | Oltre 45 km: "Luogo da nominare" |
| Ricordi suggeriti + dettaglio modificabile | VERIFIED (preview demo) | Merge/split e override su libreria reale da provare |
| Timeline per mese | VERIFIED (preview demo) | |
| Passaporto | VERIFIED (preview demo) | |
| Quiz luogo (segnaposto) e anno, ripresa partita | VERIFIED (preview: apertura modalità) / IMPLEMENTED_UNVERIFIED (tocco sulla mappa, ripresa) | |
| Card di viaggio e risultato quiz, zone private | IMPLEMENTED_UNVERIFIED | 2026-09-29: rimosso il falso "Condiviso." (iOS non dice se hai inviato o annullato) |
| Zone private in Impostazioni | IMPLEMENTED_UNVERIFIED | |

## M6 — Rifinitura e stabilizzazione

| Task | Stato | Note |
|---|---|---|
| Tema Apple chiaro/scuro | VERIFIED (preview) / IMPLEMENTED_UNVERIFIED (iPhone) | |
| Tab bar di vetro (`GlassTabBar`, expo-blur) | VERIFIED (preview, velatura) / IMPLEMENTED_UNVERIFIED (sfocatura reale) | Richiede nuova build |
| Target 44 pt, etichette VoiceOver, Riduci movimento | IMPLEMENTED_UNVERIFIED | Verifica statica + layout preview |
| VoiceOver, testo grande, contrasto | BLOCKED (serve iPhone) | Checklist §9 |
| Anteprime foto con skeleton e "Foto non disponibile" | IMPLEMENTED_UNVERIFIED | Stato errore visibile solo con asset iCloud reale |
| Ottimizzazioni librerie grandi | IMPLEMENTED_UNVERIFIED | Culling viewport + max 250 marker, WAL, transazioni uniche |
| Benchmark 1k/10k/50k | IMPLEMENTED_UNVERIFIED | Mai eseguito: checklist §10 |

## Build necessarie

Moduli nativi aggiunti dopo l'ultima build nota: `expo-task-manager`,
`expo-background-fetch`, `react-native-svg`, `expo-linear-gradient`, `expo-haptics`,
`expo-blur`. Serve **una nuova build da Pubblica** prima di eseguire la checklist;
dopo, le modifiche solo JavaScript possono andare con un aggiornamento istantaneo.

## Prossimo passo

1. Nuova build TestFlight.
2. Eseguire `docs/IPHONE_TEST_CHECKLIST.md` e compilare la sezione "Prove su
   dispositivo" di `docs/TEST_REPORT.md`.
3. Correggere ciò che fallisce, poi portare gli stati a `VERIFIED`.
