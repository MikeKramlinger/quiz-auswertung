# Quiz-Auswertung (separates Projekt)

Dieses Projekt ist unabhängig vom Prototyp und dient nur zur Auswertung von exportierten Quiz-Ergebnisdateien.

## Start

```bash
npm install
npm run dev
```

Dann im Browser die erzeugte URL öffnen.

## TypeScript/JavaScript im `src`-Ordner

In diesem Projekt ist `src` als TypeScript-Quellordner gedacht (`.ts` + `.css`).

- `tsconfig.json` nutzt `"noEmit": true`, damit `tsc` **keine** `.js`-Dateien in `src` erzeugt.
- Das Build/Transpiling übernimmt Vite.
- Falls alte `.js`-Dateien in `src` auftauchen, können diese entfernt werden.

## Was wird unterstützt?

- Mehrere JSON-Dateien per Datei-Auswahl oder Drag & Drop
- Erwartetes Format: `cfc-quiz-session-v1`
- Kennzahlen: Anzahl Dateien, Versuche, Erfolgsquote
- Erfolgsquote bewertet nur nicht-offene Aufgaben (`taskKind !== "open"`).
- Zeit- und Versuchsanzahlen bleiben unverändert und werden nicht separat für offene Fragen ausgewiesen.
- Tabellen:
  - Aufgaben-Übersicht (Versuche/Erfolg/Quote)
  - Durchlauf-Übersicht pro Datei (anklickbar)
  - Übersicht pro Quiz/Person/Datum
  - Häufigste Fehlchecks
- Separate Detailseite pro Durchlauf:
  - Reiter "Ablauf" mit Verlauf (Versuch 1..n) und Aufgaben-Details
  - Reiter "Übersicht pro Quiz/Person/Datum" mit Durchschnittswerten (Versuche/Zeit)
- Berichtsexport:
  - PDF-Bericht über einen separaten, druckoptimierten Report