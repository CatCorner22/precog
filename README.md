# Precog Pioneer

**Internal controls and residual risk management for small businesses** — segregation-of-duties detection, a library of prosecuted cases showing what each gap has cost real businesses, knowledge continuity maps, scenario modeling, and an AI advisor grounded in your business profile and that case library.

Built for owner-operated teams (2–20 people): dental and medical offices, retail, professional services, restaurants, and general small business.

## What you get

| Capability              | Description                                                                                                                                                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Start here**          | Where one person controls too much, what that exact gap has cost other businesses (prosecuted cases with government sources), how those cases came to light, and what to do first                                                                          |
| **Dashboard**           | Residual risk index, SoD health, COSO heat map, and weekly control priorities, each backed by the cases behind it                                                                                                                                          |
| **SoD detector**        | Finds incompatible duty combinations (cash + recon, vendor + pay, etc.) and shows the prosecuted case that proves each one matters                                                                                                                         |
| **Process map builder** | Interactive value stream with risks, controls, ideas, and lean waste. **Build mode** lets you add/edit/delete your own processes, assign owners and controls, drag to arrange, and export/import the map as JSON — every edit re-scores residual risk live |
| **Knowledge map**       | Single points of failure in tribal knowledge                                                                                                                                                                                                               |
| **Scenarios**           | Assumed timelines and losses you can adjust, shown next to the real cases involving the same duty conflicts                                                                                                                                                |
| **Decision journal**    | Document accept / remediate / monitor / insure with review dates                                                                                                                                                                                           |
| **Pioneer advisor**     | Tool-grounded AI brief (Grok when configured; local fallback always) that cites the prosecuted cases matching your open gaps                                                                                                                               |
| **Printed report**      | Findings, recommended controls, and the cases cited with publisher and URL, for an accountant, lender, or insurer                                                                                                                                          |
| **Cloud sync**          | Sign in to persist your business profile across devices                                                                                                                                                                                                    |

## Core loop

1. **Pick an industry** on first visit — loads a full demo template
2. **Map your business** — Process map → Build: replace demo processes with your own
3. **Score** residual risk from your team size and control posture
4. **Prioritize** with the weekly action plan, priority stack, and SoD matrix
5. **Brief** with Pioneer (user-initiated)
6. **Decide** — remediate, compensate, monitor, or accept residual on purpose

## Evidence library

Every loss figure in the app resolves to one of two things: a prosecuted case in `src/lib/precog/evidence/cases.ts`, or a published study in `src/lib/precog/evidence/benchmarks.ts`. Each case record carries the facts the source states (how it worked, the control gap, the loss, how long it ran, how it came to light, and, where stated, how long the person had served), the segregation-of-duties rules it demonstrates, the controls that would plausibly have caught it, and a direct link to the U.S. Attorney's Office or other government release. Where a source does not state a fact, the record says "unknown" rather than guess.

`npm run verify:evidence` checks the library's invariants: every rule has at least one real case behind it, every citation is an https URL, every case is tied to a rule, every guidance chunk states its basis, and every stated tenure figure has its source in the record's text. Run it before committing a change to the library.

The 0–100 scores elsewhere in the app are this app's own indices, and scenario figures are assumptions written into the scenario; the app says so wherever it shows one.

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

Educational tool only — not actuarial, legal, or forensic advice. The cases describe other organizations, not yours, and are prosecuted cases, so they skew large and late. Never scores people as fraudulent; targets are control gaps and residual exposures.
