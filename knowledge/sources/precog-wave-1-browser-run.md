# Wave 1 browser run

- **Source**: Claude Code session 79f4ec77 (session_01Rfson9Y63BcB71DDXYNrVb), working file `run-w1-results.md` and the screenshots in `screenshots/run-w1/`, made with the run skill (Playwright against the dev server). The working file is not kept; this entry is the record.
- **Type**: data
- **Author/Origin**: Claude Code (run skill), Precog at commit 2625d77
- **Published**: 2026-10-06
- **Ingested**: 2026-10-06
- **Tags**: precog, run-skill, browser, report, scenarios, wave-1

## Summary

An owner's walk through the wave-1 changes in a real browser: the landing page's case line, a 6-person dental setup, the save badge, the report's executive summary, a non-fraud scenario's insurance text and the control-failure what-if on the dental sample. Every check passed except one the test roster could not exercise. The walk found two problems that belong to later waves.

## Key concepts

- The landing page no longer claims "53 prosecuted cases" as checked; it says the records come from Justice Department and IRS releases and that Precog is still checking them.
- A 6-person dental setup kept all 6 people, and the badge read "Saved on this device" after the write.
- With staff conflicts open, the executive summary told the truth and named the counts.
- With an owner and one hygienist, the summary read "No one person other than the owner holds two conflicting duties." That is true, but the roster gave the owner no conflicting pair, so only unit tests cover the sentence that names the owner's own pairs.
- A non-fraud scenario showed "Not an insured loss under a crime policy" and modeled no recovery.
- The control-failure what-if on the dental sample read "average residual 54 → 58".
- Problem for a later wave: the summary names the owner's own pairs only when no staff conflict is open, so a reader of the summary alone does not learn that the owner also holds pairs.
- Problem for a later wave: dual release for payments changes a staff-departure scenario's figures, which a payment-release rule cannot plausibly affect.

## Notable quotes and data

> "53 U.S. federal fraud cases from Justice Department and IRS releases back the findings. Precog is still checking each record against its source." — landing page

> "12 open duty conflicts, 5 of them critical, held by 3 people." — report summary, 6-person dental setup

- "Front desk lead leaves with sole denial knowledge", dual release with it and without it: retained loss $28,753 and $36,533; days until found 82 and 89; annual cost of risk $7,305 and $8,584.
- Cause: `scoring/likelihood-model.ts:56-58` multiplies loss size by `dualSeverity` (0.85) and likelihood by `dualOtherLikelihood` (0.9) for non-fraud scenarios, and `scoring/scenario-level.ts:43` applies `noDualReleaseFactor` (1.08) whenever dual release is off, through `engine.ts:337-343`. $28,753 × 1.08 ÷ 0.85 = $36,533, and 82 × 1.08 ≈ 89 days.
- Plan: a wave-3 engine slice applies both effects to fraud scenarios only and publishes a before-and-after table for the 8 samples. Wave 2 (slice S23) already prints these figures rounded, for example "about $37,000".

## Relationships

- Agrees with: [Wave 2 review findings](precog-wave-2-review-findings.md), which records the S23 build agent's cause analysis of the dual-release effect.
- Contradicts: the engine's own comment at `likelihood-model.ts:53-55` calls the non-fraud dual-release effect deliberate on the scenario page, while the residual index applies it to fraud scenarios only, so two screens follow different rules for the same control.
