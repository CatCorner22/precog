# Precog Pioneer

Frontier Lean + Internal Controls coach for small dental practices — a **Davy Crockett LLM stack**: transparent residual risk scoring + context-packed decision coach.

## Pioneer stack

| Module | Path | Role |
|--------|------|------|
| Residual engine | `src/lib/precog/scoring/` | Inherent × (1 − effectiveness) × staff modifiers, action bands, drivers |
| Tornado sensitivity | `scoring/residual-engine.ts` | Highest-leverage control levers |
| COSO heat map | `coso.ts` + UI | 5 components, 17 principles, deep links |
| Precog scenarios | `engine.ts` | p50 / 95% CI timelines + $ impact |
| Knowledge SPOF map | knowledge UI | Continuity / single points of failure |
| Pioneer LLM coach | `coach/` | Grok `grok-4.5` when `XAI_API_KEY` present; local pioneer fallback always |

## Core loop

1. **Score** residual risk (not vibes)  
2. **Brief** with Pioneer (user-initiated)  
3. **Deep-link** into SoD / Knowledge / Precog evidence  
4. **Decide**: remediate, compensate, or accept residual on purpose  

## Develop

```bash
npm install
npm run dev
```

## Demo

**Ridgeview Family Dental** sample data ships with the app.

Educational projections only — not actuarial advice; never scores people as “fraudulent.”
