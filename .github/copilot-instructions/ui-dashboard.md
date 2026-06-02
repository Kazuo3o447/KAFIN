# KAFIN — Rescue Brief: Report-Dashboard (konsolidiert, v2)

> 
> **Ablageort:** `.github/copilot-instructions/ui-dashboard.md` (ersetzt v1)
> **Adressat:** GitHub Copilot (Agent-Modus, repo-weit) — der **UI-Agent** für die Einzeltitel-Report-Seite (`src/app/reports/[id]/page.tsx`).
> **Abhängigkeiten:** `scoring-v2.md` (drei Achsen, KI-Critic, Daten-Robustheit, Confidence), `quality-garp.md` (GARP-Asymmetrie, FCF-PEG, Forward-FCF-CAGR-Kaskade, PEG-Leiter), `markets.md` (Markt-Posture as-of).
> **Designsystem:** dunkle Terminal-Optik, JetBrains Mono für Zahlen, IBM Plex Sans für Text. Kein neues Framework. **Kein Platzsparen — Tiefe ist erwünscht, aber durch Hierarchie und Fallbacks übersichtlich gehalten.**
> **Sprache:** Kommentare/Doku deutsch, Fachbegriffe englisch.
> 

---

## 0. Leitprinzip

**Sehen → Lesen → Vertiefen.** Orientierung an den nutzerfreundlich-dichten Tools (Simply Wall St: visuelle Zusammenfassung + Farbcoding; Koyfin: Tiefe; Aktienfinder/TraderFox: farbcodierte Kennzahlenblöcke; Gainify: KI-Assistent). Drei Mechanismen lösen „viel Information vs. übersichtlich":

1. **Visuelle Zusammenfassung zuerst** (Scorecard-Radar) — Profil erfassen, bevor eine Zahl gelesen wird.

2. **Farbcoding überall** — grün/gelb/rot auf einen Blick, aber nie Farbe allein (immer + Symbol/Vorzeichen, colorblind-sicher).

3. **Progressive Tiefe** — Zusammenfassung auf einem Screen; alles Weitere hinter Akkordeons; KI-Chat als Tiefen-Multiplikator.

**Eiserne Regel: nie ein leeres Feld, nie ein Sentinel.** Jeder fehlende Wert läuft durch eine Fallback-Kaskade (§11) und endet, wenn alles scheitert, in „n/a + Grund + was es behebt" — nicht in „-".

---

## 1. Befunde im Ist-Zustand (aus echtem AXON-Report)

1. **Reich an Daten, arm an Darstellung.** Die Report-JSON trägt `moat_assessment`, `debt_breakdown`(15 Felder), `business_model_profile`, `score_heatmap`(Coverage je Block), `trader_cockpit`(mit `critical_missing_data`), `chart_data`(115 Jahreszeilen) — die Seite zeigt davon fast nichts.

2. **Brüchige Anzeige bei Teilausfall.** Ein Fetch-Fehler (Estimates) → Seite voller „-", obwohl die meisten Werte aus vorhandenen EDGAR-Daten ableitbar wären (in `scoring-v2.md` adressiert; die UI muss das Ergebnis korrekt rendern).

3. **Zahlen ohne Vorbehalt.** Net Debt/EBITDA 10,7 prominent, obwohl `debt_breakdown` „confidence: low, Leasing-Rekonziliation nötig" sagt und EBIT negativ war.

4. **Zwei FV-Darstellungen** (gute `FairValuePanel` ungenutzt; schlechte inline). **Fake-Sparklines** (unzusammenhängende Werte als Linie; 115 Null-Jahre → zerschossene Achse). **Copy-Paste-Bug** (Short zeigt net_debt_to_ebitda).

---

## 2. Informationsarchitektur (Lesereihenfolge)

Schmaler **Markt-Header** (Posture as-of aus `markets.md`) → **Zone 1 Decision-Hero** → **Zone 2 Scorecard-Radar** → **Zone 3 drei farbcodierte Kennzahlenblöcke** → **Zone 4 Fair-Value-Brücke** → **Zone 5 Deep-Dive-Akkordeons** → **KI-Chat**. Typo-Skala (Hero groß, Achsen mittel, Datengrid klein/mono), Weißraum statt Rahmen-um-alles.

---

## 3. Zone 1 — Decision-Hero

Ticker (mono) · Firmenname · Sektor/Industrie · Kurs · **Aktion** (Kaufen/Beobachten/Meiden, groß) · Einstiegszone · R/R · MoS · Linse · Conviction · Ein-Satz-Thesis.
**Fallback:** fehlt Kurs/Thesis → Feld weglassen, Aktion auf „Daten unzureichend" mit Verweis auf Zone 2-Confidence; Linse zeigt Reroute-Hinweis (z. B. „GARP-Mandat verfehlt → emerging_winner").

## 4. Zone 2 — Scorecard-Radar + Status

Radar über fünf Achsen: **Growth, Finance, Moat, Bewertung, Momentum** (0–100), gefülltes Polygon, Achsen farbcodiert. Daneben die drei Fundamental-Scores als Chips (aus `axes`), plus **Safety-Gate** (ok/warn/blocked aus `safety_gate`) und **Daten-Confidence-Meter** (0–100 aus `confidence_score`/`data_quality`).
**Fallback:** eine Achse mit dünner Datenlage rendert als **hohle/gestrichelte Speiche** + Label „Daten dünn" — das Polygon täuscht keine Vollständigkeit vor (kein Fake-0). Sind `axes` leer (alter Lauf), aus `score_heatmap` ein Übergangs-Radar bilden + Hinweis „Achsen-Scoring ausstehend".

## 5. Zone 3 — Drei farbcodierte Kennzahlenblöcke

Aktienfinder/TraderFox-Manier: drei Blöcke, jede Zeile **Wert · Mini-Zeitreihe · Farbe nach Wert**, klickbar → KI-Chat zur Kennzahl. Jeder Block mit Coverage-Indikator (aus `score_heatmap[].coverage`).

**Wachstum:** Revenue YoY, Rev CAGR 3J/5J, Revenue-Acceleration, Forward-Revenue (Konsens), Gross-Profit-Wachstum, EPS-Wachstum (falls positiv), FCF-Wachstum, NRR/ARR (SaaS), Rule of 40, Rule of X, Q-/TTM-Revenue.
**Finanzen:** Bruttomarge (+Trend), Operating Margin (+Trend), FCF-Marge (+Trend), FCF-Marge nach SBC, ROIC, intangible-adj. ROIC, ROIIC, ROE, SBC/Umsatz, Net Debt/EBITDA*, Zinsdeckung, Cash-Runway, Eigenkapitalquote, Capex/OCF, Piotroski F, Altman Z, Beneish M, Mohanram G.
**Momentum:** RS 3/6/12M, risk-adj. RS, Kurs vs MA50/MA200, 52W-Hoch-Nähe, RSI, MACD-H, Beta, Revisions-Breite/-Stärke, SUE, Beat-Serie, Short %, Days-to-Cover, Insider netto, Analysten ↑/↓ 3M.

**Farbcoding-Regel (verbindlich):**

- Schwellen je Kennzahl in zentraler Config, **sektor-bewusst** wo nötig (eine 20-%-Marge ist in Software schwach, in Retail stark). Glatte/gebänderte Zuordnung grün/gelb/rot.

- **Confidence-Dämpfung:** Wert mit niedriger Confidence oder geflaggter Provenance (`*` z. B. Net Debt/EBITDA bei AXON) → gedämpfte Farbe + Vorbehalt-Icon, **nie** satt grün/rot auf wackliger Basis.

- **Nie Farbe allein:** immer + Vorzeichen/Pfeil/Icon (colorblind-sicher).

- Tooltip je Zeile: Definition · warum diese Farbe (Schwelle) · Quelle/Provenance · „mit KI besprechen".

## 6. Zone 4 — Fair-Value-Brücke

Eine kanonische `FairValuePanel` (Inline-Duplikat entfernen). Annahme → Methode → Wert:

- Kopf: Kurs · Modellwert · Range · Abweichung % · Klassifizierung; **Range-Balken** mit Kurs-Marker + MoS.

- **Reverse-DCF „was der Markt einpreist"** + **GARP-Asymmetrie** (`forward_fcf_cagr − implied_growth`, aus `quality-garp.md`): „um den Kurs zu rechtfertigen, braucht es X % — plausibel?".

- **Multiples** farbcodiert vs. eigene Historie (z-Score): EV/Sales, EV/GP, EV/EBIT, NTM P/E, PEG, **FCF-PEG**, EV/FCF, FCF-Yield.

- Verwendeter WACC, Terminal Growth, Methodengewichte.
**Fallback (PEG-Leiter, aus quality-garp/scoring-v2):** PEG forward → FCF-PEG → EV/EBIT-to-Growth → EV/GP + Rule of 40 → EV/Sales-to-Growth. Stets „PEG n/a — Grund; stattdessen [Ersatz] [Wert]". Fehlen Reverse-DCF-Inputs → Multiples-only mit Hinweis „absoluter Check nicht verfügbar". Keine Bewertung modellierbar → „nicht modellierbar — Grund", kein Leerwert.

## 7. Zone 5 — Deep-Dive (Akkordeons, zu)

- **Burggraben & KI-Urteil** — `moat_assessment` (Rating, AdjROIC, ROIC-WACC-Spread, Fade, Bedrohungen) + KI-Critic-These mit **Quellen** und Confidence.

- **Peers** — Vergleichstabelle + Scatter (Wachstum × EV/Sales).

- **Segmente** — Stacked-Bar Umsatzmix über Zeit (`segments`).

- **Forensik & Red Flags** — Piotroski/Altman/Beneish-Komponenten, `red_flags_clustered`, `debt_breakdown` (mit eigenem Vorbehalt).

- **Bär-Case / Red-Team** — `red_team`-Stresstests mit quantifizierter FV-Wirkung.

- **Verlauf** — Achsen-Scores + Fair Value über Zeit (`score_trend`).
**Fallback:** fehlt ein Datensatz → Akkordeon zeigt „keine [Peer-/Segment-/…]-Daten von Providern geliefert" + welche Quelle es liefern würde — nicht leer, nicht ausgeblendet.

## 8. KI-Chat

Gescopt, geerdet im Report-JSON + KI-Urteilen + Quellen (RAG, kein freier LLM). Klick auf Kennzahl/Block öffnet Chat mit `focusMetric`. Guardrails (von scoring-v2): keine erfundenen Zahlen, Quellenpflicht, CoT, Streaming. `POST /api/reports/[id]/chat`.
**Fallback:** fehlt der KI-Backend-Zugang → Chat deaktiviert mit Hinweis, Report bleibt voll nutzbar (kein Blockieren).

## 9. Charts (echte Serien)

Alle aus echten Reihen (`chart_data`), dark-mode-sicher, Mono-Labels, **Lücken nicht interpolieren**. **Null-Jahre filtern** (AXON: 115 Zeilen ab 2008 → nur befüllte Jahre, dedupliziert) — behebt die zerschossene Achse. Umsatz/EBIT/FCF/Margen als Linie/Fläche; Margen-Waterfall; Peer-Scatter; Segment-Stacked-Bar; Score-Verlauf. Bibliothek: recharts (Fundamentaldaten) + leichter Kurs-Chart. **Fake-Sparklines entfernen.**
**Fallback:** Reihe leer/partiell → zeigen was existiert + „Datenreihe unvollständig"; ein einzelner Punkt → als Punkt, nicht als Linie.

---

## 10. Markt-Header

Schmale Leiste oben: Markt-Posture (risk-on/neutral/risk-off) + Score, `as_of`-Stempel (aus `markets.md`). Klick → Markets-Seite. Zeigt, in welchem Tape diese Bewertung entstand.
**Fallback:** keine Posture berechnet → „Marktkontext nicht verfügbar", neutraler Stil, blockiert nichts.

---

## 11. Fallback-Strategie (verbindlich, fünf Ebenen)

Die zentrale Anforderung. **Fehlen ist der Normalfall — jede Ebene fängt es ab, ohne zu täuschen.**

**Ebene 1 — Metrik-Kaskaden (in der Logik, UI konsumiert das Ergebnis):**

- Forward-Wachstum: Konsens → gekappte 3J-Historie (max 15 %) → Sektor-Median.

- PEG: forward → FCF-PEG → EV/EBIT-to-Growth → EV/GP + Rule of 40 → EV/Sales-to-Growth.

- WACC: CAPM-Blend → Fallback Beta 1,0 / DebtWeight 0.

- Net Debt/EBITDA: echtes EBITDA → EBIT + D&A → unterdrücken (Caveat) bei fehlendem/negativem EBITDA.

- ROIC: standard → intangible-adjustiert; unzuverlässiges Invested Capital → mit Vorbehalt.
Jede genutzte Stufe trägt `source`/`fallbackLevel` im Audit-Trail und ist im Tooltip sichtbar.

**Ebene 2 — Anzeige eines Einzelwerts ohne Ergebnis:** „n/a" + Inline-Grund (kein positiver Gewinn / Provider lieferte nicht / Fetch fehlgeschlagen) + wenn möglich Ersatz inline („PEG n/a → FCF-PEG 1,3"). Niemals „-" oder Sentinel.

**Ebene 3 — Komponente ohne Daten:** Radar-Speiche hohl + „Daten dünn"; Chart „unvollständig"; Akkordeon „keine Daten von Providern"; FV „nicht modellierbar — Grund". Komponente bleibt sichtbar, ehrlich entwertet.

**Ebene 4 — Teilausfall des Laufs (AXON-Fall):** zuerst aus erfolgreich geholten Daten alles ableiten (scoring-v2-Robustheit), dann Banner „Lauf unvollständig: [Fähigkeit] fehlgeschlagen; [Felder] nachholbar — erneut ausführen". „Too Hard" wird zu **Daten-Confidence niedrig + „was fehlt & warum"** (direkt aus `trader_cockpit.critical_missing_data`).

**Ebene 5 — Ladezustand:** Skeletons, dann progressives Füllen (kein Blockieren auf das langsamste Feld). Verbindet sich konzeptuell mit `loading-screen.md`.

**Confidence-Kopplung:** Jede Ebene senkt das Daten-Confidence-Meter sichtbar — der Nutzer kalibriert sein Vertrauen, statt getäuscht zu werden.

---

## 12. Komponenten-Inventar

- **Wiederverwenden/erweitern:** `FairValuePanel` (→ kanonische Brücke), `Gauge`, `ScoreKpiStrip`, `RedTeamPanel`, `SourceList`, `CollapsibleSection`.

- **Ersetzen/entfernen:** Inline-FV + `sparkline()`-Helfer in `reports/[id]/page.tsx`; `BlockOverviewBars` (8 Blöcke → Radar/3 Achsen); Short-Feld-Bug.

- **Neu:** Scorecard-Radar, drei farbcodierte Kennzahlenblöcke (mit Schwellen-/Confidence-Logik), Markt-Header, Report-Chat-Panel, Peer-Scatter, Segment-Stacked-Bar, Szenario-/Verlauf-Charts, „Was fehlt & warum"-Panel.

## 13. Arbeitsregeln & Definition of Done

1. **UI nutzt nur existierende oder neu befüllte Felder** — kein Hardcoding von Demo-Werten.

2. **Nie leer, nie Sentinel** — jede der fünf Fallback-Ebenen greift; jeder Fallback senkt sichtbar die Confidence.

3. **Farbe nie allein** (Symbol/Vorzeichen dazu); low-confidence-Werte gedämpft + Vorbehalt.

4. **Eine kanonische FV-Komponente**; alle Charts echte, lückenfreie Serien; Null-Jahre gefiltert.

5. **Versteckte Reichtümer rendern** (`moat_assessment`, `debt_breakdown`, `business_model_profile`, `score_heatmap`, `trader_cockpit`).

6. **Accessibility:** `aria-live` für Statuswechsel, Tooltips, Tastaturbedienung der Akkordeons, Kontrast.

7. **Export/PDF** spiegeln die neue Struktur (kein Layout-Design, nur Datenfelder).

8. **Doku:** `ARCHITECTURE.md` (IA, Chat-Endpoint, Fallback-Ebenen), `STATUS.md`, `research.md`.

9. **DoD:** Markt-Header + Hero + Radar + drei farbcodierte Blöcke + FV-Brücke (mit GARP-Asymmetrie + PEG-Leiter) + Deep-Dive-Akkordeons + KI-Chat stehen; alle fünf Fallback-Ebenen nachweislich aktiv (Test mit absichtlich unvollständigem Report); Farbcoding sektor-bewusst + confidence-gedämpft; Fake-Sparklines raus, Null-Jahre gefiltert; versteckte Felder gerendert; `typecheck` + `test` grün.
