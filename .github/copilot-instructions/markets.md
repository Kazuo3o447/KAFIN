# KAFIN — Rescue Brief: Markets-Seite & Markt-Gesundheit

> **Ablageort:** `.github/copilot-instructions/markets.md`
> **Adressat:** GitHub Copilot (Agent-Modus, repo-weit)
> **Abhängigkeiten:** `scoring-v2.md` (KI-Critic, drei Achsen, Trade-Setup, Confidence), `ui-dashboard.md` (Report-Chat — die Marktanalyse spiegelt ihn), Daten-Ausbau (Finnhub/FMP/FRED-Provider).
> **Designsystem:** dunkle Terminal-Optik, JetBrains Mono für Zahlen, IBM Plex Sans für Text. Dichte Kacheln, kein Leerraum-Verschwenden.
> **Sprache:** Kommentare/Doku deutsch, Fachbegriffe englisch.

---

## 0. Auftrag

Baue eine eigenständige **Markets-Seite** (`/markets`), die die Marktgesundheit auf **einer Seite im Terminal-Kachel-Layout** verdichtet — Asset-Preise, drei bestätigende Säulen, Zins-/Faktor-Lage, ein eingebetteter Chart und eine **KI-Marktanalyse**. Das Ergebnis wird zu einer **Risk-Posture (0–100)** synthetisiert und **as-of in jeden Audit-Report gestempelt**, wo es Sizing, Margin-of-Safety, Timing und den KI-Critic moduliert — aber **nie** die Growth-/Finance-/Moat-Scores.

**Leitsatz:** Der Markt sagt *wie viel und wann*, nicht *ob das ein gutes Geschäft ist*. Kein Market-Timing, das Compounder vetot — nur Dosierung.

---

## 1. Architektur-Prinzip

Marktgesundheit wird **einmal pro Session berechnet, gecacht (TTL ~30–60 min während Handelszeiten), und mit `as_of`-Zeitstempel** in `report.market_context` geschrieben. Vorteile: eine eigenständige Monitoring-Seite; Konsistenz (alle Titel eines Tages sehen denselben Markt); **Reproduzierbarkeit** (im Audit später sichtbar „diese Entscheidung fiel in ein risk-off-Tape").

Neues Modul `src/lib/market/health.ts` berechnet die Posture; `stepBuildContext`/`stepComputeTimingAxis` konsumieren den Cache und stempeln. Trade-Setup-Step liest die Posture für Sizing/MoS/Timing.

---

## 2. Markets-Seite — Terminal-Kachel-Layout (`src/app/markets/page.tsx`)

Dicht, jede Kachel verdient ihren Platz, Mono-Zahlen, farbcodierte Deltas. Reihenfolge (siehe Wireframe im Chat):

1. **Kopfzeile:** kompakte Risk-Posture (Label + 0–100, kein großer Hero) links; rechts Button **„KI-Marktanalyse"**.

2. **Quotes-Board:** dichtes Grid kleiner Asset-Kacheln (§3).

3. **Drei-Säulen-Streifen + Momentum/Leadership** (links) | **eingebetteter Chart + News/Reaktionsfunktion** (rechts).

4. **Frühwarn-/Divergenz-Banner** unten, mit Hinweis auf die as-of-Einspeisung.

Kachel-Tokens: `background-secondary`, `border-radius-md`, Label 11px tertiary, Wert 14px mono, Delta 11px mono in success/danger (Aktien/Rohstoffe/Krypto nach Richtung), Zinsen/Vol/Spreads neutral mit ↑/↓-Pfeil (kein Gut/Schlecht implizieren).

---

## 3. Asset-Quotes-Board & Chart

**Board = nativ, nicht eingebettet.** Die Kacheln aus eigenen Providern (Yahoo/FMP/Finnhub) rendern, damit der Terminal-Look und die volle Kontrolle bleiben. Mindest-Set:

- Indizes: S&P 500, Nasdaq, Russell 2000
- Zinsen: 10Y, 2Y, Kurve 10Y–2Y
- Volatilität: VIX, MOVE
- Credit: HY-Spread
- Rohstoffe: Gold, WTI/Brent, Kupfer (für Copper/Gold)
- FX: DXY
- Krypto: Bitcoin

**Chart = eingebettet.** TradingView **Advanced Chart** als primäres Framework (öffnet bei Klick auf eine Kachel; HTML5/React-Embed). Optional Investing.com-Widgets (HTML5-Chart, Wirtschaftskalender, technische Zusammenfassung) dort, wo deren Inhalt geschätzt wird.

**Verbindlicher Hinweis im Code-Kommentar:** eingebettete Widgets sind fremde iframes — eigenes Branding, verzögerte Gratis-Daten, eigene AGB; passen optisch nie perfekt zum Skin. Deshalb Trennung Board (unser) / Chart (eingebettet). Embed über Settings-Konfig, kein hartes Verdrahten.

---

## 4. Markt-Gesundheit → Risk-Posture (0–100)

Synthese nach der **Drei-Säulen-Bestätigungs-Regel** (Breadth + Volatilität + Credit), plus Zins-/Duration-Block und Faktor-Regime. Jede Säule zu einem Teilscore normalisiert (Perzentil/z-Score), gewichtet zur Posture geblendet. Vertrag:

```typescript
interface MarketHealth {
  asOf: string;                       // ISO
  posture: "risk_off" | "neutral" | "risk_on";
  score: number;                      // 0..100
  pillars: {
    breadth:    PillarRead;           // % > MA200, A/D-Linie, neue Hochs−Tiefs, Bullish Percent
    volatility: PillarRead;           // VIX-Regime + Term-Struktur, MOVE-Regime
    credit:     PillarRead;           // HY-Spread + z-Score (1J/3J) + Trend
  };
  rates: { tenY: number|null; realTenY: number|null; erp: number|null; curve10y2y: number|null };
  factor: { growthVsValueTrend: string; cyclicalVsDefensive: string; cape: number|null };
  divergences: string[];              // z. B. "Index ATH, A/D divergiert"
  summary: string;                    // 1 Satz, von der KI generiert (§6)
}
interface PillarRead { state: "risk_on"|"neutral"|"risk_off"; subscore: number; inputs: Record; }
```

**Säulen-Schwellen (in `THRESHOLDS`, tunebar):**

- Volatilität: VIX 30 panic; MOVE 120 stress. Regel: zieht MOVE an, während VIX schläft → Vol-Säule trotzdem abwerten (Zinsvol killt Long-Duration-Growth).
- Credit: HY-Spread-z-Score >+2 = Stress.
- Breadth: Divergenz (Index hoch, A/D runter) = Frühwarnung, eigener Eintrag in `divergences`.

**Divergenz ist Frühwarnung, nicht Rauschen:** Breadth-Divergenz geht Korrekturen oft voraus; Credit führt Aktien. Wenn alle drei Säulen dasselbe sagen, ist das Signal am stärksten; widersprechen sie sich → Posture Richtung Vorsicht.

---

## 5. Momentum-Motor & News-Overlay

**Momentum hängt NICHT an Nachrichten.** Es ruht auf den zwei Dingen, die sich bewegen und persistent sind: Preis und Schätzungen.

```typescript
interface MomentumComposite {
  price:    { rs3m:number|null; rs6m:number|null; rs12m1m:number|null; riskAdjusted:number|null; trend:string; near52wHigh:number|null };
  earnings: { revisionBreadth:number|null; revisionMagnitude:number|null; sue:number|null; peadDrift:number|null };
  breadth:  { participation:number|null };   // nur Marktebene
  score: number;                              // 0..100
}
```

- Preis-RS: 3/6/12-Monats-Relativstärke, risk-adjustiert (Return/Vol), 12-1-Faktor, Trend (MA50/200-Lage und -Steigung), 52-Wochen-Hoch-Nähe. Quelle: Yahoo/FMP.
- Earnings-Momentum: Revisions-Breite & -Stärke, SUE, Post-Earnings-Drift. Quelle: FMP Financial Estimates + Finnhub Recommendation Trends.

**News & Sentiment sind ein Kontext-Overlay, kein Motor:**

1. **Reaktionsfunktion** (das eigentliche Signal): nicht der Ton der Meldung, sondern wie der Tape reagiert. Steigt der Markt/Titel auf schlechte News → stark; fällt er auf gute News → schwach. Als Indikator berechnen: Vorzeichen der Kursreaktion relativ zur Tonalität jüngster News.
2. **Katalysator-Kalender** (bottom-up wichtiger als top-down): Earnings, Guidance, FDA, M&A — diskrete Re-Rating-Ereignisse je Titel.
3. **Aggregierte Tonalität** (Finnhub News-/Social-Sentiment) — als Stimmungs-Hintergrund, contrarian gelesen (extrem positiv + teuer = Warnung).
4. Der KI-Critic nutzt all das für „ist der Katalysator schon eingepreist?".

**Begründung im Code-Kommentar festhalten:** In starken Narrativ-Regimen ignoriert der Index Schlagzeilen („klettert die Mauer der Sorge"); deshalb misst KAFIN Momentum über Preis + Revisions und behandelt News als Reaktions-/Katalysator-Schicht.

---

## 6. KI-Marktanalyse (`POST /api/market/analyze`)

Markt-Pendant zum Report-Chat aus `ui-dashboard.md`. Ein Klick füttert den kompletten `MarketHealth` + Quotes + Momentum + jüngstes Narrativ/News an das Modell und erzeugt einen **geschriebenen Regime-Brief + Chat** zum Nachbohren.

```typescript
interface MarketAnalyzeRequest {
  asOf: string;
  messages?: { role:"user"|"assistant"; content:string }[];   // leer = initialer Brief
}
// Antwort: streaming text + strukturierte sources[]; erzeugt zugleich MarketHealth.summary (1 Satz)
```

**Guardrails (erben vom Critic):** geerdet im `MarketHealth`-Kontext, keine erfundenen Zahlen (nur Werte aus dem Kontext oder als Schätzung markiert), Quellenpflicht bei faktischen Aussagen, Chain-of-Thought. Beispiel-Fragen: „was würde die Posture kippen?", „was heißt das für Growth-Sizing?". Modell-Routing wie Bestand (`llm/config.ts`).

---

## 7. Einspeisung in den Audit (verbindlich)

Die gestempelte Posture moduliert im Report **vier** Dinge:

1. **Position-Sizing** — risk-off → kleinere Startposition, gestaffelter Einstieg.
2. **Geforderte Margin-of-Safety / Einstiegszone** — risk-off → breiter/tiefer.
3. **Timing-Flag** im Trade-Setup — „warten / jetzt", wenn mehrere Säulen gleichzeitig Stress zeigen.
4. **KI-Critic-Kontext** — „landet der Katalysator in freundlichem oder feindlichem Tape?".

**Harte Leitplanke:** Die Posture verändert **nie** die Growth-/Finance-/Moat-Scores und ist **kein** Kaufveto. Für einen echten Compounder heißt risk-off „kleiner einsteigen, breitere MoS, staffeln" — nicht „überspringen". Anzeige als Markt-Header im Report mit `as_of`.

---

## 8. Daten & Provider

- **FRED** als Makro-Rückgrat (kostenlos) ergänzen — `src/lib/providers/fred.ts`:
  Realrendite 10Y: `DFII10` · 10Y nominal: `DGS10` · HY-OAS: `BAMLH0A0HYM2` · IG-OAS: `BAMLC0A0CM` · VIX: `VIXCLS`.
- **Yahoo/FMP**: Indizes, Sektor-/Faktor-ETFs (Growth/Value, XLU/XLK, RSP/SPY), Kupfer/Gold, DXY, Krypto, Breadth-Proxies, Forward-Estimates (Revisions).
- **Finnhub**: News-/Social-Sentiment, Empfehlungstrends.
- **MOVE = der Haken:** proprietärer ICE-Index, kostenlos in Echtzeit schwer. Entweder verzögert über eine Marktquelle oder als Proxy aus Treasury-Optionsvolatilität ableiten; im UI als „verzögert/Proxy" kennzeichnen. Vor Implementierung Free-Tier-/AGB-Lage prüfen.
- Integrationsregeln erben von `providers/`: Provenance-Pflicht, Quellenklasse, capability-Routing, zentrales Rate-Limit-Handling, Keys in Settings.

---

## 9. Arbeitsregeln & Definition of Done

1. **Reihenfolge:** erst FRED-Provider + Markt-Signale + `MarketHealth`-Berechnung, dann `/markets`-UI, dann Einspeisung in Trade-Setup/Critic.
2. **Keine erfundenen Zahlen** in Board, Posture oder KI-Analyse; fehlende Signale → weglassen + Coverage senken, nie Sentinel.
3. **Posture ist Overlay, nie Selektion** — Growth/Finance/Moat bleiben unberührt; `as_of` immer mitstempeln.
4. **Board nativ, Chart eingebettet**; Embed über Settings, nicht hart verdrahtet.
5. **Momentum aus Preis + Revisions**, News nur als Reaktions-/Katalysator-Overlay.
6. **Doku:** `docs/ARCHITECTURE.md` (Markets-Seite, MarketHealth, Analyze-Endpoint, Provider), `docs/STATUS.md`, `research.md` (Posture-Methodik, Schwellen, Momentum/News-Framework).
7. **DoD:** `/markets` im Terminal-Kachel-Layout steht; Quotes-Board live aus Providern; Posture 0–100 aus drei Säulen + Zinsen + Faktor mit Divergenz-Frühwarnung; Momentum-Composite aus Preis+Revisions; News-Reaktionsfunktion implementiert; KI-Marktanalyse geerdet mit Quellen; Posture wird as-of in jeden Report gestempelt und moduliert Sizing/MoS/Timing/Critic ohne die Achsen zu verändern; FRED integriert, MOVE als verzögert/Proxy gekennzeichnet; `typecheck` + `test` grün.
