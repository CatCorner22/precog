# Precog Pioneer

**Internal controls and residual risk management for small businesses** — transparent scoring, segregation-of-duties detection, knowledge continuity maps, scenario modeling, and an AI advisor grounded in your business profile.

Built for owner-operated teams (2–20 people): dental and medical offices, retail, professional services, restaurants, and general small business.

## What you get

| Capability | Description |
|------------|-------------|
| **Dashboard** | Residual risk score, SoD health, COSO heat map, and weekly control priorities |
| **SoD detector** | Finds incompatible duty combinations (cash + recon, vendor + pay, etc.) |
| **Process map** | Interactive value stream with risks, controls, ideas, and lean waste |
| **Knowledge map** | Single points of failure in tribal knowledge |
| **Scenarios** | Timeline and dollar impact projections with insurance cost-of-risk |
| **Decision journal** | Document accept / remediate / monitor / insure with review dates |
| **Pioneer advisor** | Tool-grounded AI brief (Grok when configured; local fallback always) |
| **Cloud sync** | Sign in to persist your business profile across devices |

## Core loop

1. **Score** residual risk from your team size and control posture  
2. **Prioritize** with the weekly action plan and SoD matrix  
3. **Brief** with Pioneer (user-initiated)  
4. **Decide** — remediate, compensate, monitor, or accept residual on purpose  

## Develop

```bash
npm install
npm run dev    # live preview on port 8080
npm run build
npm run typecheck
```

## Demo data

Five industry templates ship with demo processes, people, knowledge graphs, controls, and scenarios:

- **Dental** — Ridgeview Family Dental (default)
- **Retail** — Harbor Lane Boutique
- **Restaurant** — Ember & Oak Kitchen
- **Professional services** — Northgate Advisory Group
- **General SMB** — Main Street Business Co.

Switch industry in **Business profile** to load the full template (process map, SoD, scenarios, dual-release defaults).

Educational projections only — not actuarial, legal, or forensic advice. Never scores people as fraudulent; targets are control gaps and residual exposures.
