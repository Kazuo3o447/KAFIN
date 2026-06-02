# KAFIN — Quality-GARP-Linse + GARP-Core-Upgrades

> **Ablageort:** `.github/copilot-instructions/quality-garp.md`
> **Adressat:** GitHub Copilot (Agent-Modus)
> **Abhängigkeit:** `scoring-v2.md` (Linsen-System, drei Achsen, KI-Critic, Ableitungs-Robustheit). Diese Linse reiht sich neben `quality_compounder` und `emerging_winner` ein.
> **Herkunft:** basiert auf einem externen „Quality GARP"-Blueprint, **bewertet und korrigiert** — die harten Gatekeeper werden linsen-scoped statt global, vier Ideen werden in den Core gehoben.

---

## 0. Verdikt & Auftrag

Der Blueprint ist konzeptionell stark (GARP nach Lynch; MSCI Quality GARP als validierter Index). Übernommen wird er **mit einer entscheidenden Korrektur**: Die harten Quality-Gates dürfen **nicht global** gelten — sie würden Hyper-Growth-Sieger (AXON, frühes Amazon, frühe SaaS) sofort mit Score 0 verwerfen. Stattdessen:

1. **Neue Linse `quality_garp`** mit linsen-internen Gates (Durchfall → Reroute, kein Score 0).

2. **Vier Ideen in den Core heben** (linsen-unabhängig): Reverse-DCF-Asymmetrie, FCF-basierte Bewertung, Forward-FCF-CAGR-Fallback-Kaskade, Capex/OCF-Intensität.

---

## 1. Core-Upgrades (für ALLE Linsen)

### 1.1 Reverse-DCF-Asymmetrie
```
asymmetrie = forward_fcf_cagr − implied_growth_rate(reverse_dcf)
```
Positiv (Fundamentalprognose > eingepreist) = GARP-Edge; negativ = Überbewertung.
- `key_metrics.reverse_dcf_asymmetry` ablegen
- In der Fair-Value-Brücke prominent zeigen, an den KI-Critic geben
- **Voraussetzung:** Reverse-DCF muss Plausibilitäts-Check bestehen (implizite Rate muss in plausiblem Bereich liegen)
- `forward_fcf_cagr_source` = Fallback-Stufe (1–3) mitloggern

### 1.2 FCF-basierte Bewertung
- `fcf_peg = (EV/FCF) / (forward_fcf_growth × 100)` — bereinigt Bilanzkosmetik/SBC
- `ev_fcf` = EV ÷ FCF TTM
- PEG-Fallback-Leiter: positiver FCF aber kein positiver Gewinn → FCF-PEG **vor** EV/Sales-to-Growth einhängen (neue Stufe 2.5 = FCF-PEG)
- Kein Division-Artefakt: FCF-PEG nur wenn FCF > 0 AND forward_fcf_growth > 0

### 1.3 Forward-FCF-CAGR-Fallback-Kaskade
1. Primary: Wall-Street-Konsens (FMP-Estimates / Finnhub)
2. Fallback 1: historische 3-Jahres-FCF-CAGR, **gekappt bei 15 %** (verhindert Fortschreibung von Einmaleffekten)
3. Fallback 2: Sektor-Median-Wachstum
Jede Stufe mit `forward_fcf_cagr_source` im Audit-Trail

### 1.4 Capex/OCF-Intensität
- `capex_ocf_ratio = |capex| / operating_cash_flow` (je niedriger, desto mehr Skaleneffekte)
- Nur wenn OCF > 0 (kein irreführendes Vorzeichen)

---

## 2. Linse `quality_garp`

**Anlagehorizont 3–5 Jahre. Sucht das Delta zwischen fundamentaler Wertschöpfung und Multiplikator-Expansion.**

### Phase 1 — Quality-Gatekeeper (NUR linsen-intern)

Gates: FCF TTM > 0 · ROIC > WACC · Altman Z > 2,99

**Korrektur gegenüber Blueprint:** Durchfall bedeutet **nicht** Score 0, sondern `lens_fit: false` + automatische Umleitung zur `emerging_winner`-Linse. Begründung im Report: „außerhalb des GARP-Mandats (unprofitabel/reinvestierend), bewertet via emerging_winner".

### Phase 2 — GARP-Scoring

| Block | Gewicht | Logik | Scoring |
|-------|---------|-------|---------|
| Reverse-DCF-Asymmetrie | 40% | `forward_fcf_cagr − implied_growth` | volle Punkte ab +8pp; 0 wenn implizit > Prognose |
| FCF-PEG | 30% | `(EV/FCF)/(fwd_fcf_growth×100)` | voll bei <1,0; absteigend bis 2,0; 0 bei >2,0 |
| Margin-Momentum | 15% | Gross- & FCF-Margen-**Slope** (pp/Jahr) über 3J | Pluspunkte für stabile/expandierende Margen bei Umsatzwachstum |
| Capex/OCF | 15% | `capex / operating_cash_flow` | niedriger = höher |

**Korrekturen gegenüber Blueprint:**
- Glatte, stückweise-lineare Kennlinien statt harter Bänder (kein 7,9-%-vs-8,1-%-Sprung)
- Margen-**Slope** statt „Margen-CAGR" (CAGR einer Prozentzahl ist instabil)

---

## 3. Integration

- **Linsen-System:** `quality_garp` neben `quality_compounder`/`emerging_winner` registrieren; Phase-1-Reroute-Regel im Engine
- **Drei Achsen:** Asymmetrie/FCF-PEG → Valuation/Finance-Achse; Margin-Momentum → Growth/Finance; Capex/OCF → Finance
- **KI-Critic:** sanitisierter JSON-Payload mit `lens`, `finalScore`, `passedGatekeepers`, `keyAsymmetry{impliedGrowth, forwardEstimates, delta}`, `fcfPeg`; übersetzt Asymmetrie in narrative These

---

## 4. Definition of Done

- [ ] `reverse_dcf_asymmetry`, `fcf_peg`, `ev_fcf`, `capex_ocf_ratio`, `forward_fcf_cagr_source` als Core-Kennzahlen in `DerivedMetrics` + `KeyMetrics`
- [ ] FCF-PEG in der PEG-Leiter als Stufe 2.5 (nach EV/EBIT, vor EV/GP)
- [ ] `forward_fcf_cagr` Fallback-Kaskade (Konsens → hist. 3y CAGR gekappt 15% → Sektor-Median)
- [ ] Linse `quality_garp` registriert; Phase-1-Gates linsen-intern; Durchfall → Reroute zu `emerging_winner`
- [ ] Phase-2-Blöcke mit glatten Kennlinien; Schwellen in `THRESHOLDS`
- [ ] KI-Critic erhält sanitisierten Payload; numerischer Fingerprint invariant
- [ ] `typecheck` + `test` grün
