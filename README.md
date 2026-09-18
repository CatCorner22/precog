# Precog Pioneer

**Internal controls and residual risk management for small businesses** — transparent scoring, segregation-of-duties detection, knowledge continuity maps, scenario modeling, and an AI advisor grounded in your business profile.

Built for owner-operated teams (2–20 people): dental and medical offices, retail, professional services, restaurants, and general small business.

## What you get

| Capability | Description |
|------------|-------------|
| **Dashboard** | Residual risk score, SoD health, COSO heat map, and weekly control priorities |
| **SoD detector** | Finds incompatible duty combinations (cash + recon, vendor + pay, etc.) |
| **Process map builder** | Interactive value stream with risks, controls, ideas, and lean waste. **Build mode** lets you add/edit/delete your own processes, assign owners and controls, drag to arrange, and export/import the map as JSON — every edit re-scores residual risk live |
| **Knowledge map** | Single points of failure in tribal knowledge |
| **Scenarios** | Timeline and dollar impact projections with insurance cost-of-risk |
| **Decision journal** | Document accept / remediate / monitor / insure with review dates |
| **Pioneer advisor** | Tool-grounded AI brief (Grok when configured; local fallback always) |
| **Cloud sync** | Sign in to persist your business profile across devices |

## Core loop

1. **Pick an industry** on first visit — loads a full demo template  
2. **Map your business** — Process map → Build: replace demo processes with your own  
3. **Score** residual risk from your team size and control posture  
4. **Prioritize** with the weekly action plan, priority stack, and SoD matrix  
5. **Brief** with Pioneer (user-initiated)  
6. **Decide** — remediate, compensate, monitor, or accept residual on purpose  

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
