# Lista di prove su iPhone — Atlante

Da eseguire su una build TestFlight che include tutti i moduli nativi (vedi
STATUS.md → "Build necessarie"). Per ogni prova annota: OK / KO / non eseguita, e
per i KO cosa hai visto (uno screenshot aiuta). Poi riporta tutto in
`docs/TEST_REPORT.md` → "Prove su dispositivo".

Tempo stimato: 60–90 minuti, esclusa l'attesa del background (§4).

## 0. Preparazione

- iPhone con iOS aggiornato, Wi‑Fi, batteria sopra il 50%.
- Nella Galleria assicurati di avere almeno:
  - una foto scattata con la Fotocamera e posizione attiva (con GPS);
  - uno screenshot (senza GPS);
  - una Live Photo;
  - un panorama;
  - una foto ricevuta via AirDrop o WhatsApp (spesso senza GPS o solo EXIF);
  - se usi "Ottimizza spazio iPhone" in iCloud Foto: qualche foto vecchia di anni
    (probabilmente solo su iCloud).
- Impostazioni iOS → Generali → Aggiorna app in background: attivo.
- Risparmio energetico: disattivo.
- Parti da un'installazione pulita: elimina Atlante e reinstallalo da TestFlight.

## 1. Diagnostica M0

1. Apri l'app → "Esplora una demo" → icona Impostazioni in alto → Diagnostica →
   "Diagnostica M0 (capacità native)" → **Esegui diagnostica**.
2. Consenti l'accesso quando iOS lo chiede.

| Passo | Atteso |
|---|---|
| 1-2 Permesso | verde, stato `granted_full` o `granted_limited` |
| 3 Lettura batch | verde, "25 asset letti, totale libreria: N" con N simile al numero reale |
| 4 Coordinate | verde, "X/25 con coordinate reali (es. lat, lon)". Annota X, illeggibili, iCloud |
| 5 Persistenza | verde, "Motore: sqlite" (NON "asyncstorage") |
| 6 Mappa | arancione per scelta: si controlla a vista in §5 |

Annota i numeri del passo 4: sono la prova principale di M0.

## 2. Permessi

Torna all'onboarding: Impostazioni → reimposta/esci dalla demo, oppure reinstalla.

| # | Azione | Atteso |
|---|---|---|
| 2.1 | "Usa le mie foto" → **Non consentire** | Banner che spiega il motivo e un pulsante che apre Impostazioni iOS. Nessuna foto, nessun errore |
| 2.2 | Da Impostazioni iOS → Atlante → Foto → **Accesso limitato**, scegli 5 foto | Tornando nell'app: banner "accesso limitato", solo quelle foto dopo la scansione |
| 2.3 | Cambia la selezione (aggiungi 3 foto) | L'app non rilegge da sola; dopo "Riscansiona" compaiono le nuove |
| 2.4 | Imposta **Accesso completo** → Riscansiona | Scansione con contatore "X di Y" |
| 2.5 | Durante una scansione, vai in Impostazioni iOS e metti **Nessuna** | Tornando: scansione interrotta, stato "serve il permesso", le foto già lette restano visibili, nessun crash |
| 2.6 | Rimetti l'accesso completo | Nessuna scansione parte da sola. Con "Riscansiona"/"Riprendi" riparte dal punto raggiunto |

## 3. Ripresa scansione (primo piano)

Serve una libreria di almeno qualche migliaio di foto per avere il tempo di interrompere.

| # | Azione | Atteso |
|---|---|---|
| 3.1 | Avvia la scansione, aspetta ~500 foto, premi **Pausa** | Card "In pausa" con Riprendi |
| 3.2 | Chiudi l'app dal multitasking, riaprila | Rimane in pausa (non riparte da sola), contatore invariato |
| 3.3 | Premi **Riprendi**, a ~1000 chiudi dal multitasking | — |
| 3.4 | Riapri | Riprende da sola da ~1000 (al massimo 100 foto indietro), la mappa non è vuota |
| 3.5 | Durante una scansione invia un **aggiornamento istantaneo** e riapri due volte | Come 3.4 |
| 3.6 | A fine scansione confronta il totale con la Galleria | Nessuna foto doppia (il totale non supera quello di iOS) |

## 4. Scansione in background

| # | Azione | Atteso |
|---|---|---|
| 4.1 | Avvia una scansione, annota il contatore | Card: "continuerà in background" |
| 4.2 | Premi Home (NON chiudere dal multitasking). Metti in carica su Wi‑Fi | — |
| 4.3 | Dopo 1–3 ore riapri | Il contatore è andato avanti rispetto a 4.1 |
| 4.4 | Disattiva "Aggiorna app in background" per Atlante e riapri | La card lo dice e chiede di tenere l'app aperta |

Nota: è iOS a decidere quando risvegliare l'app; un KO su 4.3 va ripetuto una notte in carica prima di considerarlo un difetto.

## 5. Mappa

| # | Azione | Atteso |
|---|---|---|
| 5.1 | Apri Mappa | Mappa Apple a tutto schermo, marker con miniatura e numero |
| 5.2 | Ingrandisci su una città | I gruppi si dividono |
| 5.3 | Tocca un gruppo di foto tutte nello stesso punto | Si apre l'elenco di tutte, non solo la prima |
| 5.4 | Tocca un marker | Pannello con nome città, periodo, foto; si espande a griglia |
| 5.5 | Filtro anno | Restano solo i marker di quell'anno |
| 5.6 | Pillola "senza posizione" | Elenco: separa "senza GPS" da "metadati non leggibili" |
| 5.7 | Foto su entrambi i lati del meridiano 180 (es. Figi) o su 0,0 | Nessun marker a 0,0 finto; inquadratura corretta |
| 5.8 | Tab bar | Effetto vetro reale, la mappa si vede sfocata sotto; icone sopra l'indicatore Home |

## 6. Ricordi, timeline, passaporto

| # | Azione | Atteso |
|---|---|---|
| 6.1 | Ricordi → Capitoli | Viaggi reali con nome tipo "Lisbona, novembre 2025" |
| 6.2 | Stesso luogo in anni diversi | Due capitoli separati |
| 6.3 | Rinomina un capitolo, poi Riscansiona | Il nome resta |
| 6.4 | Scarta un capitolo, poi Riscansiona | Non ricompare |
| 6.5 | Timeline | Mesi in ordine, incluse foto senza posizione |
| 6.6 | Passaporto | Città/paesi coerenti con i tuoi viaggi |

## 7. Quiz

| # | Azione | Atteso |
|---|---|---|
| 7.1 | "Dove l'hai scattata?" → tocca la mappa → Conferma | Segnaposto, punto vero, linea tratteggiata, km e punti |
| 7.2 | "In che anno?" | Griglia 2x2, verde/rosso |
| 7.3 | A metà partita premi Esci, chiudi l'app, riapri Gioca | "Partita in sospeso", riprende dalla prima domanda senza risposta |
| 7.4 | Con accesso limitato a poche foto | Card modalità disattivata con il motivo, non un quiz vuoto |

## 8. Card condivisibile

| # | Azione | Atteso |
|---|---|---|
| 8.1 | Apri un ricordo → Card di viaggio → Condividi → salva in File | Il file PNG si apre fuori dall'app, niente mappa bianca, testi leggibili, foto dritte |
| 8.2 | Condividi e poi **chiudi il foglio senza inviare** | L'app NON scrive "Condiviso": mostra "Card creata come immagine…" |
| 8.3 | Apri il PNG salvato in un visualizzatore EXIF (es. app "Exif Metadata") | Nessuna coordinata GPS, nessun nome dispositivo |
| 8.4 | Crea una zona privata sopra un luogo del ricordo, rigenera la card | Quelle foto spariscono, il titolo diventa neutro "Il mio viaggio" se era automatico |
| 8.5 | Card risultato quiz | Punteggio e copertina, nessun luogo |

## 9. Accessibilità

| # | Azione | Atteso |
|---|---|---|
| 9.1 | VoiceOver attivo: Onboarding → Mappa → Ricordi → Gioca | Ogni pulsante ha un nome sensato, niente "pulsante" muto |
| 9.2 | Testo grande (Impostazioni → Schermo → Dimensioni testo, al massimo) | Nessun testo tagliato nei pulsanti principali |
| 9.3 | Riduci movimento attivo | Niente pulse sugli skeleton, onboarding senza animazioni |
| 9.4 | Tema scuro di sistema | Tutto leggibile, tab bar scura |
| 9.5 | Aumenta contrasto | Testi secondari ancora leggibili |

## 10. Prestazioni

1. Impostazioni → Diagnostica → "Prestazioni con librerie grandi".
2. Premi **10k foto**, poi **50k foto**.
3. Fai uno screenshot dei risultati (mediana / 95° percentile). Le righe arancioni
   sono quelle da ottimizzare.
4. Annota anche: tempo dall'apertura dell'app alla mappa piena, con la tua libreria
   reale (a occhio, in secondi), e il numero di foto della tua Galleria.

## 11. Resilienza

| # | Azione | Atteso |
|---|---|---|
| 11.1 | Riavvia l'iPhone, apri l'app | Foto, ricordi e quiz in sospeso ancora lì, nessuna rilettura automatica |
| 11.2 | Elimina 3 foto dalla Galleria, Riscansiona | Spariscono da mappa e ricordi; gli originali in Galleria non sono mai toccati dall'app |
| 11.3 | Modalità aereo, apri l'app | Funziona tutto tranne le foto solo su iCloud ("Foto non disponibile") |

## Cosa mandarmi

- La tabella OK/KO per sezione (anche solo i KO).
- I numeri del passo 4 della Diagnostica e gli screenshot del benchmark.
- Per ogni KO: cosa hai fatto e cosa hai visto.
