# FUTURE.md

> **Zweck:** Sammelstelle für Entscheidungen, die bewusst **verschoben** wurden. Jeder Eintrag enthält Kontext, Optionen, vorläufige Empfehlung und Trigger ("wann entscheiden wir?"). **Pflicht:** Wird ein Punkt entschieden, wandert er nach [MANIFEST.md](MANIFEST.md) / [ARCHITECTURE.md](ARCHITECTURE.md) / [AGENT.md](AGENT.md) und der Eintrag hier wird **gestrichen** (nicht editiert).

---

## Offene Entscheidungen

### F-001 · Default-Ollama-Modell
- **Kontext:** App soll dynamisch alle in Ollama installierten Modelle anbieten (`GET /api/tags`).
- **Aktueller Default-Mechanismus:** Erstes verfügbares Modell aus der Liste; User-Auswahl wird in Settings persistiert.
- **Optionen für später:** Festes Empfehlungsmodell pro Step (Extract / Scoring / Summary / Red-Team) hart eintragen.
- **Trigger:** Sobald wir ein Modell auf Prod-Hardware (AMD) als „good enough" für JSON-Mode + Reasoning identifiziert haben.
- **Status:** offen.

### F-002 · Job-Queue / Worker
- **Kontext:** MVP fährt Runs in-process im Next.js-Node-Prozess (`EventEmitter` → SSE).
- **Trigger:** sobald >1 paralleler Run nötig, oder Run-Dauer > 5 min, oder Crash-Resilienz wichtiger wird.
- **Vorschlag:** BullMQ + Redis als zusätzlicher Compose-Service, Worker als separater Container.
- **Status:** offen.

### F-003 · Sentiment-/News-Pipeline
- **Kontext:** RSS-Ingestion + FinBERT-Klassifizierung sind in `research.md` §15.3 vorgesehen, aber nicht im MVP.
- **Optionen:** FinBERT via Ollama (sofern Modell verfügbar), HF Inference lokal, oder klassisches Lexikon-basiertes Scoring.
- **Trigger:** nach MVP, sobald Watchlist regelmäßig betrieben wird.
- **Status:** offen.

### F-004 · Red-Team-Agent
- **Kontext:** `research.md` §18 verlangt Red-Team-Pflicht ab Score ≥ 90.
- **MVP:** entfällt.
- **Trigger:** sobald erste Reports konsistent Score > 80 erzeugen.
- **Status:** offen.

### F-005 · Postgres + pgvector Migration
- **Kontext:** Drizzle ist Schema-portabel; SQLite reicht für lokales Single-User-Setup.
- **Trigger:** sobald RAG über historische Reports nötig, oder Multi-User, oder Volltextsuche jenseits SQLite-FTS5.
- **Status:** offen.

### F-006 · Versionsvergleich-Tiefe
- **Entschieden 2026-05-20:** JSON-Diff + Score-Δ-Tabelle reichen für MVP. Semantischer Markdown-Diff später, falls Bedarf.
- **Trigger:** falls User-Feedback semantischen Diff fordert.
- **Status:** entschieden für MVP, offen für Phase 2.

### F-007 · Multi-Sprache (DE/EN)
- **Kontext:** Pilot war bilingual. Stock-Research-App startet **DE-only** im UI; Quellen meist EN.
- **Trigger:** falls EN-UI gewünscht (z. B. Sharing).
- **Status:** offen.

### F-008 · Authentifizierung
- **Kontext:** MVP läuft local-only, **ohne Auth**.
- **Trigger:** sobald Deployment außerhalb des Heimnetzes.
- **Optionen:** Basic Auth via Reverse Proxy (Caddy/Traefik), oder OIDC mit Authelia/Keycloak.
- **Status:** offen.

### F-009 · Desktop-Wrapper (Tauri)
- **Kontext:** Web-App ist primär; Tauri-Wrapper würde Distribution als Native-App ermöglichen.
- **Trigger:** wenn Single-User-Install vereinfacht werden soll.
- **Status:** offen.

### F-010 · Backtesting / Paper-Trading-Gate
- **Kontext:** `research.md` §20 definiert die Übergabe an die Trade-Engine. Trade-Engine selbst ist out-of-scope.
- **Trigger:** nachdem Research-Reports stabil und reproduzierbar laufen.
- **Status:** offen.

### F-011 · Sektorale ERP / professionelle WACC-Schätzung
- **Kontext:** Phase F.1 verwendet einen vereinfachten WACC (10 % für Growth, 8 % für Value-Modelle). Für präzisere Fair-Value-Schätzungen sollte der Equity Risk Premium (ERP) sektoral differenziert werden (z. B. Damodaran-ERP-Tabellen je Land/Sektor).
- **Optionen:** (a) ERP-Lookup-Tabelle statisch eingebettet (einfach, infrequentes Update), (b) API-Anbindung zu Damodaran-Daten (automatisch aber komplex), (c) benutzer-konfigurierbare WACC-Override in Settings.
- **Empfehlung:** Option (a) als erster Schritt; jährliches Update der ERP-Tabelle als Maintenance-Task.
- **Trigger:** wenn Fair-Value-Abweichungen von +/- 30 % im Schnitt von DCF-Analysen gemessen werden.
- **Status:** offen.
